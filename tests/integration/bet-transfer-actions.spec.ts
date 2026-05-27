import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTestDb, type TestDb } from '../helpers/db';

let testDb: TestDb;

vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

const ctxRef = {
  current: null as null | {
    user: { id: string };
    member: { id: string; role: string };
    club: { id: string };
  },
};

vi.mock('@/lib/auth/session', () => ({
  requireUnlocked: async () => ctxRef.current!,
  requireRole: async () => ctxRef.current!,
}));

vi.mock('next/cache', () => ({
  revalidatePath: () => {},
}));

import {
  createBetTransferAction,
  voidBetTransferAction,
} from '@/app/[locale]/(app)/bet/actions';

async function seedClub() {
  const { users } = await import('@/lib/db/schema/auth');
  const { clubs } = await import('@/lib/db/schema/clubs');
  const [u] = await testDb
    .insert(users)
    .values({ email: `u-${Date.now()}-${Math.random()}@example.test`, name: 'U' })
    .returning();
  if (!u) throw new Error('seed user');
  const [club] = await testDb
    .insert(clubs)
    .values({ name: 'Test', currencyCode: 'CZK', defaultLocale: 'cs-CZ' })
    .returning();
  if (!club) throw new Error('seed club');
  return { creator: u, club };
}

async function seedMember(
  clubId: string,
  label: string,
  role: 'member' | 'treasurer' = 'member',
) {
  const { users } = await import('@/lib/db/schema/auth');
  const { members } = await import('@/lib/db/schema/members');
  const [u] = await testDb
    .insert(users)
    .values({ email: `${label}-${Date.now()}-${Math.random()}@example.test`, name: label })
    .returning();
  if (!u) throw new Error('seed user');
  const [m] = await testDb
    .insert(members)
    .values({
      clubId,
      userId: u.id,
      email: u.email,
      displayName: label,
      role,
    })
    .returning();
  if (!m) throw new Error('seed member');
  return { u, m };
}

async function seedOpenSession(clubId: string, openedByUserId: string) {
  const { drinkSessions } = await import('@/lib/db/schema/sessions');
  const [s] = await testDb
    .insert(drinkSessions)
    .values({ clubId, openedByUserId, startedAt: new Date() })
    .returning();
  if (!s) throw new Error('seed session');
  return s;
}

async function seedClosedSession(clubId: string, openedByUserId: string) {
  const { drinkSessions } = await import('@/lib/db/schema/sessions');
  const [s] = await testDb
    .insert(drinkSessions)
    .values({
      clubId,
      openedByUserId,
      startedAt: new Date(),
      endedAt: new Date(),
    })
    .returning();
  if (!s) throw new Error('seed session');
  return s;
}

async function seedBeer(clubId: string, createdByUserId: string) {
  const { beerTypes } = await import('@/lib/db/schema/catalog');
  const [b] = await testDb
    .insert(beerTypes)
    .values({
      clubId,
      name: 'Pilsner',
      unitPriceMinor: 5000n,
      currentStock: 100,
      createdByUserId,
    })
    .returning();
  if (!b) throw new Error('seed beer');
  return b;
}

async function seedConsumption(opts: {
  clubId: string;
  drinkSessionId: string;
  memberId: string;
  beerTypeId: string;
  createdByUserId: string;
}) {
  const { consumptions } = await import('@/lib/db/schema/consumption');
  const [c] = await testDb
    .insert(consumptions)
    .values({
      clubId: opts.clubId,
      drinkSessionId: opts.drinkSessionId,
      memberId: opts.memberId,
      beerTypeId: opts.beerTypeId,
      unitPriceMinorSnapshot: 5000n,
      createdByUserId: opts.createdByUserId,
    })
    .returning();
  if (!c) throw new Error('seed consumption');
  return c;
}

describe('createBetTransferAction', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
    ctxRef.current = null;
  });

  it('happy path — loser transfers winner\'s consumption to their tab', async () => {
    const { creator, club } = await seedClub();
    const winner = await seedMember(club.id, 'winner');
    const loser = await seedMember(club.id, 'loser');
    const session = await seedOpenSession(club.id, creator.id);
    const beer = await seedBeer(club.id, creator.id);
    const winnerCons = await seedConsumption({
      clubId: club.id,
      drinkSessionId: session.id,
      memberId: winner.m.id,
      beerTypeId: beer.id,
      createdByUserId: winner.u.id,
    });

    ctxRef.current = {
      user: { id: loser.u.id },
      member: { id: loser.m.id, role: 'member' },
      club: { id: club.id },
    };

    const result = await createBetTransferAction({
      sourceConsumptionId: winnerCons.id,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { eq } = await import('drizzle-orm');
    const { betTransfers } = await import('@/lib/db/schema/bets');
    const transfer = await testDb.query.betTransfers.findFirst({
      where: eq(betTransfers.id, result.betTransferId),
    });
    expect(transfer?.fromMemberId).toBe(winner.m.id);
    expect(transfer?.toMemberId).toBe(loser.m.id);
    expect(transfer?.createdByUserId).toBe(loser.u.id);
  });

  it('SELF_TRANSFER when trying to transfer own consumption', async () => {
    const { creator, club } = await seedClub();
    const self = await seedMember(club.id, 'self');
    const session = await seedOpenSession(club.id, creator.id);
    const beer = await seedBeer(club.id, creator.id);
    const ownCons = await seedConsumption({
      clubId: club.id,
      drinkSessionId: session.id,
      memberId: self.m.id,
      beerTypeId: beer.id,
      createdByUserId: self.u.id,
    });

    ctxRef.current = {
      user: { id: self.u.id },
      member: { id: self.m.id, role: 'member' },
      club: { id: club.id },
    };
    const result = await createBetTransferAction({
      sourceConsumptionId: ownCons.id,
    });
    expect(result).toEqual({ ok: false, code: 'SELF_TRANSFER' });
  });

  it('ALREADY_TRANSFERRED when an active transfer already exists', async () => {
    const { creator, club } = await seedClub();
    const winner = await seedMember(club.id, 'winner');
    const a = await seedMember(club.id, 'a');
    const b = await seedMember(club.id, 'b');
    const session = await seedOpenSession(club.id, creator.id);
    const beer = await seedBeer(club.id, creator.id);
    const winnerCons = await seedConsumption({
      clubId: club.id,
      drinkSessionId: session.id,
      memberId: winner.m.id,
      beerTypeId: beer.id,
      createdByUserId: winner.u.id,
    });

    ctxRef.current = {
      user: { id: a.u.id },
      member: { id: a.m.id, role: 'member' },
      club: { id: club.id },
    };
    await createBetTransferAction({ sourceConsumptionId: winnerCons.id });

    ctxRef.current = {
      user: { id: b.u.id },
      member: { id: b.m.id, role: 'member' },
      club: { id: club.id },
    };
    const second = await createBetTransferAction({
      sourceConsumptionId: winnerCons.id,
    });
    expect(second).toEqual({ ok: false, code: 'ALREADY_TRANSFERRED' });
  });

  it('OUT_OF_SCOPE when the source session has ended', async () => {
    const { creator, club } = await seedClub();
    const winner = await seedMember(club.id, 'winner');
    const loser = await seedMember(club.id, 'loser');
    const closedSession = await seedClosedSession(club.id, creator.id);
    const beer = await seedBeer(club.id, creator.id);
    const winnerCons = await seedConsumption({
      clubId: club.id,
      drinkSessionId: closedSession.id,
      memberId: winner.m.id,
      beerTypeId: beer.id,
      createdByUserId: winner.u.id,
    });

    ctxRef.current = {
      user: { id: loser.u.id },
      member: { id: loser.m.id, role: 'member' },
      club: { id: club.id },
    };
    const result = await createBetTransferAction({
      sourceConsumptionId: winnerCons.id,
    });
    expect(result).toEqual({ ok: false, code: 'OUT_OF_SCOPE' });
  });

  it('NOT_FOUND when the consumption is in another club', async () => {
    const a = await seedClub();
    const b = await seedClub();
    const bWinner = await seedMember(b.club.id, 'b-winner');
    const bSession = await seedOpenSession(b.club.id, b.creator.id);
    const bBeer = await seedBeer(b.club.id, b.creator.id);
    const bCons = await seedConsumption({
      clubId: b.club.id,
      drinkSessionId: bSession.id,
      memberId: bWinner.m.id,
      beerTypeId: bBeer.id,
      createdByUserId: bWinner.u.id,
    });

    const aLoser = await seedMember(a.club.id, 'a-loser');
    ctxRef.current = {
      user: { id: aLoser.u.id },
      member: { id: aLoser.m.id, role: 'member' },
      club: { id: a.club.id },
    };
    const result = await createBetTransferAction({
      sourceConsumptionId: bCons.id,
    });
    expect(result).toEqual({ ok: false, code: 'NOT_FOUND' });
  });

  it('a voided transfer leaves the consumption free to re-transfer', async () => {
    const { creator, club } = await seedClub();
    const winner = await seedMember(club.id, 'winner');
    const loserA = await seedMember(club.id, 'loserA');
    const loserB = await seedMember(club.id, 'loserB');
    const session = await seedOpenSession(club.id, creator.id);
    const beer = await seedBeer(club.id, creator.id);
    const winnerCons = await seedConsumption({
      clubId: club.id,
      drinkSessionId: session.id,
      memberId: winner.m.id,
      beerTypeId: beer.id,
      createdByUserId: winner.u.id,
    });

    // loser A takes it.
    ctxRef.current = {
      user: { id: loserA.u.id },
      member: { id: loserA.m.id, role: 'member' },
      club: { id: club.id },
    };
    const firstTransfer = await createBetTransferAction({
      sourceConsumptionId: winnerCons.id,
    });
    expect(firstTransfer.ok).toBe(true);
    if (!firstTransfer.ok) return;

    // loser A voids it.
    await voidBetTransferAction({
      betTransferId: firstTransfer.betTransferId,
    });

    // loser B should now be free to take it.
    ctxRef.current = {
      user: { id: loserB.u.id },
      member: { id: loserB.m.id, role: 'member' },
      club: { id: club.id },
    };
    const second = await createBetTransferAction({
      sourceConsumptionId: winnerCons.id,
    });
    expect(second.ok).toBe(true);
  });
});

describe('voidBetTransferAction', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
    ctxRef.current = null;
  });

  async function setupTransfer() {
    const { creator, club } = await seedClub();
    const winner = await seedMember(club.id, 'winner');
    const loser = await seedMember(club.id, 'loser');
    const session = await seedOpenSession(club.id, creator.id);
    const beer = await seedBeer(club.id, creator.id);
    const winnerCons = await seedConsumption({
      clubId: club.id,
      drinkSessionId: session.id,
      memberId: winner.m.id,
      beerTypeId: beer.id,
      createdByUserId: winner.u.id,
    });
    ctxRef.current = {
      user: { id: loser.u.id },
      member: { id: loser.m.id, role: 'member' },
      club: { id: club.id },
    };
    const t = await createBetTransferAction({
      sourceConsumptionId: winnerCons.id,
    });
    if (!t.ok) throw new Error('seed transfer');
    return { club, winner, loser, transferId: t.betTransferId };
  }

  it('creator can void their own transfer', async () => {
    const { transferId } = await setupTransfer();
    const result = await voidBetTransferAction({ betTransferId: transferId });
    expect(result).toEqual({ ok: true });
  });

  it('non-creator non-treasurer member is FORBIDDEN', async () => {
    const { club, transferId } = await setupTransfer();
    const stranger = await seedMember(club.id, 'stranger');
    ctxRef.current = {
      user: { id: stranger.u.id },
      member: { id: stranger.m.id, role: 'member' },
      club: { id: club.id },
    };
    const result = await voidBetTransferAction({ betTransferId: transferId });
    expect(result).toEqual({ ok: false, code: 'FORBIDDEN' });
  });

  it('non-creator TREASURER can void (override path)', async () => {
    const { club, transferId } = await setupTransfer();
    const treas = await seedMember(club.id, 'treas', 'treasurer');
    ctxRef.current = {
      user: { id: treas.u.id },
      member: { id: treas.m.id, role: 'treasurer' },
      club: { id: club.id },
    };
    const result = await voidBetTransferAction({ betTransferId: transferId });
    expect(result).toEqual({ ok: true });
  });

  it('ALREADY_VOIDED on a second void attempt', async () => {
    const { transferId } = await setupTransfer();
    await voidBetTransferAction({ betTransferId: transferId });
    const second = await voidBetTransferAction({ betTransferId: transferId });
    expect(second).toEqual({ ok: false, code: 'ALREADY_VOIDED' });
  });

  it('NOT_FOUND on a cross-club transfer id', async () => {
    const a = await setupTransfer();
    const b = await setupTransfer();
    // a's caller tries to void b's transfer.
    ctxRef.current = {
      user: { id: a.loser.u.id },
      member: { id: a.loser.m.id, role: 'member' },
      club: { id: a.club.id },
    };
    const result = await voidBetTransferAction({
      betTransferId: b.transferId,
    });
    expect(result).toEqual({ ok: false, code: 'NOT_FOUND' });
  });
});

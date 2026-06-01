import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

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

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { recreateLastMatchAction } from '@/app/[locale]/(app)/match/actions';
import { createAgreementTx, cancelAgreementTx } from '@/lib/db/queries/match-agreements';
import { users } from '@/lib/db/schema/auth';
import { clubs } from '@/lib/db/schema/clubs';
import { members } from '@/lib/db/schema/members';
import { matchAgreements } from '@/lib/db/schema/matches';

async function seed() {
  const [club] = await testDb
    .insert(clubs)
    .values({ name: 'TC', currencyCode: 'CZK', defaultLocale: 'cs' })
    .returning();
  async function user(name: string) {
    const [u] = await testDb
      .insert(users)
      .values({ email: `${name}-${Date.now()}-${Math.random()}@x.test`, name, emailVerified: true })
      .returning();
    return u!;
  }
  async function member(name: string, u: { id: string; email: string }) {
    const [m] = await testDb
      .insert(members)
      .values({
        clubId: club!.id,
        userId: u.id,
        email: u.email,
        displayName: name,
        role: 'member',
        acceptedInvitationAt: new Date(),
      })
      .returning();
    return m!;
  }
  const uA = await user('A');
  const uB = await user('B');
  const uC = await user('C');
  const uD = await user('D');
  const mA = await member('Alice', uA);
  const mB = await member('Bob', uB);
  const mC = await member('Carol', uC);
  const mD = await member('Dave', uD);
  return { club: club!, uA, uB, mA, mB, mC, mD };
}

function asAlice(club: string, uA: string, mA: string) {
  ctxRef.current = {
    user: { id: uA },
    member: { id: mA, role: 'member' },
    club: { id: club },
  };
}

async function countAgreements(clubId: string): Promise<number> {
  const rows = await testDb.select().from(matchAgreements).where(eq(matchAgreements.clubId, clubId));
  return rows.length;
}

describe('recreateLastMatchAction', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
    ctxRef.current = null;
  });

  it('clones a SINGLES match into a new OPEN agreement', async () => {
    const { club, uA, mA, mB } = await seed();
    const src = await createAgreementTx({
      clubId: club.id,
      createdByUserId: uA.id,
      input: { format: 'singles', forBeer: true, sides: { A: { seat1: mA.id }, B: { seat1: mB.id } } },
    });
    if (!src.ok) throw new Error('seed');

    asAlice(club.id, uA.id, mA.id);
    const result = await recreateLastMatchAction();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.agreementId).not.toBe(src.agreementId);

    // Two agreements now exist; the clone is OPEN with the same lineup.
    expect(await countAgreements(club.id)).toBe(2);
    const clone = await testDb.query.matchAgreements.findFirst({
      where: eq(matchAgreements.id, result.agreementId),
    });
    expect(clone!.format).toBe('singles');
    expect(clone!.forBeer).toBe(true);
    expect(clone!.resultRecordedAt).toBeNull();
    expect(clone!.cancelledAt).toBeNull();
  });

  it('clones a DOUBLES match preserving seats + pairing + forBeer', async () => {
    const { club, uA, mA, mB, mC, mD } = await seed();
    const src = await createAgreementTx({
      clubId: club.id,
      createdByUserId: uA.id,
      input: {
        format: 'doubles',
        forBeer: false,
        pairingKind: 'crossed',
        sides: { A: { seat1: mA.id, seat2: mB.id }, B: { seat1: mC.id, seat2: mD.id } },
      },
    });
    if (!src.ok) throw new Error('seed');

    asAlice(club.id, uA.id, mA.id);
    const result = await recreateLastMatchAction();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const clone = await testDb.query.matchAgreements.findFirst({
      where: eq(matchAgreements.id, result.agreementId),
    });
    expect(clone!.format).toBe('doubles');
    expect(clone!.pairingKind).toBe('crossed');

    const sides = await testDb.query.matchAgreementSides.findMany();
    const cloneSides = sides.filter((s) => s.agreementId === result.agreementId);
    expect(cloneSides).toHaveLength(4);
  });

  it('clones a CANCELLED source match (Q4)', async () => {
    const { club, uA, mA, mB } = await seed();
    const src = await createAgreementTx({
      clubId: club.id,
      createdByUserId: uA.id,
      input: { format: 'singles', forBeer: false, sides: { A: { seat1: mA.id }, B: { seat1: mB.id } } },
    });
    if (!src.ok) throw new Error('seed');
    await cancelAgreementTx({ agreementId: src.agreementId, clubId: club.id, cancelledByUserId: uA.id });

    asAlice(club.id, uA.id, mA.id);
    const result = await recreateLastMatchAction();
    expect(result.ok).toBe(true);
  });

  it('NO_LAST_MATCH when the member has never played', async () => {
    const { club, uA, mA } = await seed();
    asAlice(club.id, uA.id, mA.id);
    expect(await recreateLastMatchAction()).toEqual({ ok: false, code: 'NO_LAST_MATCH' });
  });

  it('STALE_PARTICIPANT when a source participant is now inactive — creates nothing', async () => {
    const { club, uA, mA, mB } = await seed();
    const src = await createAgreementTx({
      clubId: club.id,
      createdByUserId: uA.id,
      input: { format: 'singles', forBeer: false, sides: { A: { seat1: mA.id }, B: { seat1: mB.id } } },
    });
    if (!src.ok) throw new Error('seed');
    // Deactivate Bob.
    await testDb.update(members).set({ isActive: false }).where(eq(members.id, mB.id));

    asAlice(club.id, uA.id, mA.id);
    const result = await recreateLastMatchAction();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('STALE_PARTICIPANT');
    if (result.code !== 'STALE_PARTICIPANT') return;
    expect(result.memberName).toBe('Bob');
    // No new agreement created.
    expect(await countAgreements(club.id)).toBe(1);
  });

  it('only clones the acting member\'s own-club last match (per-club scoping)', async () => {
    const a = await seed();
    const b = await seed();
    // Club A has Alice's match; Club B has its own newer one.
    const srcA = await createAgreementTx({
      clubId: a.club.id,
      createdByUserId: a.uA.id,
      input: { format: 'singles', forBeer: false, sides: { A: { seat1: a.mA.id }, B: { seat1: a.mB.id } } },
    });
    if (!srcA.ok) throw new Error('seed');
    await createAgreementTx({
      clubId: b.club.id,
      createdByUserId: b.uA.id,
      input: { format: 'singles', forBeer: false, sides: { A: { seat1: b.mA.id }, B: { seat1: b.mB.id } } },
    });

    asAlice(a.club.id, a.uA.id, a.mA.id);
    const result = await recreateLastMatchAction();
    expect(result.ok).toBe(true);
    // The clone landed in club A (2 agreements), club B untouched (1).
    expect(await countAgreements(a.club.id)).toBe(2);
    expect(await countAgreements(b.club.id)).toBe(1);
  });
});

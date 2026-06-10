import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { makeTestDb, type TestDb } from '../helpers/db';

let testDb: TestDb;

vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

import { createAgreementTx, recordResultTx } from '@/lib/db/queries/match-agreements';
import {
  deliverBeerDebtTx,
  voidBeerDebtTx,
} from '@/lib/db/queries/match-bet-debts';
import { effectiveConsumptionTotal } from '@/lib/balance/calculate';
import { users } from '@/lib/db/schema/auth';
import { betTransfers } from '@/lib/db/schema/bets';
import { beerTypes } from '@/lib/db/schema/catalog';
import { consumptions } from '@/lib/db/schema/consumption';
import { clubs } from '@/lib/db/schema/clubs';
import { matchBetDebts } from '@/lib/db/schema/match-bet-debts';
import { members } from '@/lib/db/schema/members';

interface Scene {
  clubId: string;
  userId: string;
  winnerId: string; // to_member — is owed the beer
  loserId: string; // from_member — owes the beer
  outsiderId: string; // non-party
  beerId: string;
  debtId: string;
}

// Seed a club with winner/loser/outsider, a for-beer singles agreement,
// and record A (winner) beating B (loser) → one PENDING beer-IOU.
async function seedAndRecord(): Promise<Scene> {
  const [club] = await testDb
    .insert(clubs)
    .values({ name: 'TC', currencyCode: 'CZK', defaultLocale: 'cs' })
    .returning();
  if (!club) throw new Error('club');

  const mkUser = async (n: string) => {
    const [u] = await testDb
      .insert(users)
      .values({ email: `${n}@x.test`, name: n, emailVerified: true })
      .returning();
    if (!u) throw new Error('user');
    return u;
  };
  const mkMember = async (userId: string, name: string) => {
    const [m] = await testDb
      .insert(members)
      .values({
        clubId: club.id,
        userId,
        email: `${name}@x.test`,
        displayName: name,
        role: 'member',
        acceptedInvitationAt: new Date(),
      })
      .returning();
    if (!m) throw new Error('member');
    return m;
  };
  const u = await mkUser('actor');
  const uA = await mkUser('winner');
  const uB = await mkUser('loser');
  const uC = await mkUser('outsider');
  const memberA = await mkMember(uA.id, 'winner');
  const memberB = await mkMember(uB.id, 'loser');
  const memberC = await mkMember(uC.id, 'outsider');

  const [beer] = await testDb
    .insert(beerTypes)
    .values({ clubId: club.id, name: 'Pilsner', unitPriceMinor: 40n, currentStock: 5, createdByUserId: u.id })
    .returning();
  if (!beer) throw new Error('beer');

  const created = await createAgreementTx({
    clubId: club.id,
    createdByUserId: u.id,
    input: {
      format: 'singles',
      forBeer: true,
      sides: { A: { seat1: memberA.id }, B: { seat1: memberB.id } },
      betBeerTypeId: beer.id,
    },
  });
  if (!created.ok) throw new Error('create');
  const rec = await recordResultTx({
    agreementId: created.agreementId,
    clubId: club.id,
    recordedByUserId: u.id,
    winningSide: 'A',
  });
  if (!rec.ok) throw new Error('record');

  const [debt] = await testDb.select().from(matchBetDebts).where(eq(matchBetDebts.clubId, club.id));
  if (!debt) throw new Error('debt');

  return {
    clubId: club.id,
    userId: u.id,
    winnerId: memberA.id,
    loserId: memberB.id,
    outsiderId: memberC.id,
    beerId: beer.id,
    debtId: debt.id,
  };
}

describe('voidBeerDebtTx — spec 030 write-off', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
  });

  it('winner writes off: status → voided, no money/stock moves', async () => {
    const s = await seedAndRecord();

    const r = await voidBeerDebtTx({
      debtId: s.debtId,
      clubId: s.clubId,
      actorUserId: s.userId,
      actorMemberId: s.winnerId,
      isElevated: false,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error();
    expect(r.loserName).toBe('loser');

    const [debt] = await testDb.select().from(matchBetDebts).where(eq(matchBetDebts.id, s.debtId));
    expect(debt?.status).toBe('voided');
    expect(debt?.voidedAt).not.toBeNull();
    expect(debt?.settledAt).toBeNull(); // chk_..._status_consistency

    // No money / stock side effects whatsoever.
    expect(await testDb.select().from(betTransfers)).toHaveLength(0);
    expect(await testDb.select().from(consumptions)).toHaveLength(0);
    const [beer] = await testDb.select().from(beerTypes).where(eq(beerTypes.id, s.beerId));
    expect(beer?.currentStock).toBe(5); // untouched
    expect(await effectiveConsumptionTotal(s.loserId)).toBe(0n);
  });

  it('LOSER cannot write off their own IOU (would let them evade the debt)', async () => {
    const s = await seedAndRecord();

    const r = await voidBeerDebtTx({
      debtId: s.debtId,
      clubId: s.clubId,
      actorUserId: s.userId,
      actorMemberId: s.loserId, // the one who owes
      isElevated: false,
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error();
    expect(r.code).toBe('FORBIDDEN');

    // Debt untouched.
    const [debt] = await testDb.select().from(matchBetDebts).where(eq(matchBetDebts.id, s.debtId));
    expect(debt?.status).toBe('pending');
  });

  it('an elevated (treasurer+) non-party may write off', async () => {
    const s = await seedAndRecord();
    const r = await voidBeerDebtTx({
      debtId: s.debtId,
      clubId: s.clubId,
      actorUserId: s.userId,
      actorMemberId: s.outsiderId,
      isElevated: true,
    });
    expect(r.ok).toBe(true);
    const [debt] = await testDb.select().from(matchBetDebts).where(eq(matchBetDebts.id, s.debtId));
    expect(debt?.status).toBe('voided');
  });

  it('a non-party, non-elevated actor is forbidden', async () => {
    const s = await seedAndRecord();
    const r = await voidBeerDebtTx({
      debtId: s.debtId,
      clubId: s.clubId,
      actorUserId: s.userId,
      actorMemberId: s.outsiderId,
      isElevated: false,
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error();
    expect(r.code).toBe('FORBIDDEN');
  });

  it('cannot write off an already-delivered debt', async () => {
    const s = await seedAndRecord();
    const deliver = await deliverBeerDebtTx({
      debtId: s.debtId,
      clubId: s.clubId,
      actorUserId: s.userId,
      actorMemberId: s.winnerId,
      isElevated: false,
    });
    expect(deliver.ok).toBe(true);

    const r = await voidBeerDebtTx({
      debtId: s.debtId,
      clubId: s.clubId,
      actorUserId: s.userId,
      actorMemberId: s.winnerId,
      isElevated: false,
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error();
    expect(r.code).toBe('ALREADY_SETTLED');
    // The delivered transfer survives — write-off didn't unwind it.
    expect(await testDb.select().from(betTransfers)).toHaveLength(1);
  });

  it('is idempotent — second write-off returns ALREADY_SETTLED', async () => {
    const s = await seedAndRecord();
    const first = await voidBeerDebtTx({
      debtId: s.debtId,
      clubId: s.clubId,
      actorUserId: s.userId,
      actorMemberId: s.winnerId,
      isElevated: false,
    });
    expect(first.ok).toBe(true);
    const second = await voidBeerDebtTx({
      debtId: s.debtId,
      clubId: s.clubId,
      actorUserId: s.userId,
      actorMemberId: s.winnerId,
      isElevated: false,
    });
    expect(second.ok).toBe(false);
    if (second.ok) throw new Error();
    expect(second.code).toBe('ALREADY_SETTLED');
  });
});

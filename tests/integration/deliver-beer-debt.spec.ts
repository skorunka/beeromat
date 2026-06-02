import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { makeTestDb, type TestDb } from '../helpers/db';

let testDb: TestDb;

vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

import { createAgreementTx, recordResultTx, reverseResultTx } from '@/lib/db/queries/match-agreements';
import { deliverBeerDebtTx } from '@/lib/db/queries/match-bet-debts';
import { effectiveConsumptionTotal } from '@/lib/balance/calculate';
import { getMyTabForSession } from '@/lib/db/queries/consumption';
import { getOpenSessionForClub } from '@/lib/db/queries/sessions';
import { users } from '@/lib/db/schema/auth';
import { betTransfers, betTransferVoids } from '@/lib/db/schema/bets';
import { beerTypes } from '@/lib/db/schema/catalog';
import { consumptions } from '@/lib/db/schema/consumption';
import { clubs } from '@/lib/db/schema/clubs';
import { matchBetDebts } from '@/lib/db/schema/match-bet-debts';
import { members } from '@/lib/db/schema/members';

interface Scene {
  clubId: string;
  userId: string;
  winnerId: string; // memberA
  loserId: string; // memberB
  outsiderId: string; // memberC (non-party)
  beerId: string;
  altBeerId: string;
  debtId: string;
}

async function seedAndRecord(opts?: { stock?: number; price?: bigint }): Promise<Scene> {
  const stock = opts?.stock ?? 5;
  const price = opts?.price ?? 40n;

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
  const memberA = await mkMember(uA.id, 'winner'); // winner
  const memberB = await mkMember(uB.id, 'loser'); // loser
  const memberC = await mkMember(uC.id, 'outsider'); // outsider

  const [beer] = await testDb
    .insert(beerTypes)
    .values({ clubId: club.id, name: 'Pilsner', unitPriceMinor: price, currentStock: stock, createdByUserId: u.id })
    .returning();
  const [altBeer] = await testDb
    .insert(beerTypes)
    .values({ clubId: club.id, name: 'Kozel', unitPriceMinor: 30n, currentStock: 5, createdByUserId: u.id })
    .returning();
  if (!beer || !altBeer) throw new Error('beer');

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
    winningSide: 'A', // A (winner) beats B (loser)
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
    altBeerId: altBeer.id,
    debtId: debt.id,
  };
}

describe('deliverBeerDebtTx — spec 030', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
  });

  it('books the cost on the loser, settles the debt, decrements stock', async () => {
    const s = await seedAndRecord({ stock: 3, price: 40n });

    const r = await deliverBeerDebtTx({
      debtId: s.debtId,
      clubId: s.clubId,
      actorUserId: s.userId,
      actorMemberId: s.winnerId, // winner delivers
      isElevated: false,
    });
    expect(r.ok).toBe(true);

    // Debt settled.
    const [debt] = await testDb.select().from(matchBetDebts).where(eq(matchBetDebts.id, s.debtId));
    expect(debt?.status).toBe('settled');
    expect(debt?.settledBeerTypeId).toBe(s.beerId);

    // One consumption (winner drank) + one transfer winner→loser + stock −1.
    const cons = await testDb.select().from(consumptions);
    expect(cons).toHaveLength(1);
    expect(cons[0]?.memberId).toBe(s.winnerId);
    const transfers = await testDb.select().from(betTransfers);
    expect(transfers).toHaveLength(1);
    expect(transfers[0]?.fromMemberId).toBe(s.winnerId);
    expect(transfers[0]?.toMemberId).toBe(s.loserId);
    const [beer] = await testDb.select().from(beerTypes).where(eq(beerTypes.id, s.beerId));
    expect(beer?.currentStock).toBe(2);

    // Balances: loser pays, winner unchanged.
    expect(await effectiveConsumptionTotal(s.loserId)).toBe(40n);
    expect(await effectiveConsumptionTotal(s.winnerId)).toBe(0n);
  });

  it('is idempotent — second delivery does not double-charge', async () => {
    const s = await seedAndRecord({ stock: 5 });
    const first = await deliverBeerDebtTx({
      debtId: s.debtId,
      clubId: s.clubId,
      actorUserId: s.userId,
      actorMemberId: s.loserId,
      isElevated: false,
    });
    expect(first.ok).toBe(true);
    const second = await deliverBeerDebtTx({
      debtId: s.debtId,
      clubId: s.clubId,
      actorUserId: s.userId,
      actorMemberId: s.loserId,
      isElevated: false,
    });
    expect(second.ok).toBe(false);
    if (second.ok) throw new Error();
    expect(second.code).toBe('ALREADY_SETTLED');
    expect(await testDb.select().from(betTransfers)).toHaveLength(1); // not 2
  });

  it('honors an explicit beer override', async () => {
    const s = await seedAndRecord();
    const r = await deliverBeerDebtTx({
      debtId: s.debtId,
      clubId: s.clubId,
      actorUserId: s.userId,
      actorMemberId: s.winnerId,
      isElevated: false,
      beerTypeId: s.altBeerId,
    });
    expect(r.ok).toBe(true);
    const [debt] = await testDb.select().from(matchBetDebts).where(eq(matchBetDebts.id, s.debtId));
    expect(debt?.settledBeerTypeId).toBe(s.altBeerId);
    expect(await effectiveConsumptionTotal(s.loserId)).toBe(30n); // alt beer price
  });

  it('refuses when the chosen beer is out of stock (no partial write)', async () => {
    const s = await seedAndRecord({ stock: 0 }); // planned beer empty
    const r = await deliverBeerDebtTx({
      debtId: s.debtId,
      clubId: s.clubId,
      actorUserId: s.userId,
      actorMemberId: s.winnerId,
      isElevated: false,
      beerTypeId: s.beerId, // explicitly the empty one
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error();
    expect(r.code).toBe('OUT_OF_STOCK');
    expect(await testDb.select().from(betTransfers)).toHaveLength(0);
    const [debt] = await testDb.select().from(matchBetDebts).where(eq(matchBetDebts.id, s.debtId));
    expect(debt?.status).toBe('pending'); // untouched
  });

  it('forbids a non-party, non-elevated actor', async () => {
    const s = await seedAndRecord();
    const r = await deliverBeerDebtTx({
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

  it('balance invariant holds after delivery (effectiveConsumptionTotal == Σ tab entries)', async () => {
    const s = await seedAndRecord({ price: 44n });
    await deliverBeerDebtTx({
      debtId: s.debtId,
      clubId: s.clubId,
      actorUserId: s.userId,
      actorMemberId: s.winnerId,
      isElevated: false,
    });
    const session = await getOpenSessionForClub(s.clubId);
    for (const memberId of [s.loserId, s.winnerId]) {
      const eff = await effectiveConsumptionTotal(memberId, session?.id);
      const tab = await getMyTabForSession({
        memberId,
        userId: s.userId,
        session,
        undoWindowSeconds: 300,
      });
      expect(eff).toBe(tab.totalMinor);
    }
  });

  it('reverse after delivery unwinds the booked cost', async () => {
    const s = await seedAndRecord({ price: 40n });
    await deliverBeerDebtTx({
      debtId: s.debtId,
      clubId: s.clubId,
      actorUserId: s.userId,
      actorMemberId: s.winnerId,
      isElevated: false,
    });
    expect(await effectiveConsumptionTotal(s.loserId)).toBe(40n);

    const rev = await reverseResultTx({
      agreementId: (await testDb.select().from(matchBetDebts).where(eq(matchBetDebts.id, s.debtId)))[0]!
        .agreementId,
      clubId: s.clubId,
      reversedByUserId: s.userId,
    });
    expect(rev.ok).toBe(true);
    if (!rev.ok) throw new Error();
    expect(rev.voidedTransferCount).toBe(1);
    expect(await testDb.select().from(betTransferVoids)).toHaveLength(1);
    // Money unwound.
    expect(await effectiveConsumptionTotal(s.loserId)).toBe(0n);
  });
});

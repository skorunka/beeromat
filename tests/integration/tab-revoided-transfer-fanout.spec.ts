import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTestDb, type TestDb } from '../helpers/db';

let testDb: TestDb;

vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

import { getMyTabForSession } from '@/lib/db/queries/consumption';
import { effectiveConsumptionTotal } from '@/lib/balance/calculate';
import { users } from '@/lib/db/schema/auth';
import { betTransfers, betTransferVoids } from '@/lib/db/schema/bets';
import { beerTypes } from '@/lib/db/schema/catalog';
import { clubs } from '@/lib/db/schema/clubs';
import { consumptions } from '@/lib/db/schema/consumption';
import { members } from '@/lib/db/schema/members';
import { drinkSessions, type DrinkSession } from '@/lib/db/schema/sessions';

// Regression: a consumption that was transferred, the transfer
// voided, then re-transferred (a supported flow — see
// createBetTransferAction: "A voided transfer leaves the consumption
// free to re-transfer") leaves TWO bet_transfer rows on one
// consumption (1 voided + 1 active). The tab query's LEFT JOIN on
// bet_transfers must not fan that into duplicate rows, and the
// winner's total must still match effectiveConsumptionTotal.

async function seed() {
  const [club] = await testDb
    .insert(clubs)
    .values({ name: 'TC', currencyCode: 'CZK', defaultLocale: 'cs' })
    .returning();
  async function user(name: string) {
    const [u] = await testDb
      .insert(users)
      .values({ email: `${name}@x.test`, name })
      .returning();
    return u!;
  }
  async function member(name: string, u: { id: string }) {
    const [m] = await testDb
      .insert(members)
      .values({
        clubId: club!.id,
        userId: u.id,
        email: `${name}@x.test`,
        displayName: name,
        role: 'member',
      })
      .returning();
    return m!;
  }
  const uA = await user('Alice');
  const uB = await user('Bob');
  const mA = await member('Alice', uA);
  const mB = await member('Bob', uB);
  const [beer] = await testDb
    .insert(beerTypes)
    .values({
      clubId: club!.id,
      name: 'Pilsner',
      unitPriceMinor: 5000n,
      currentStock: 100,
      createdByUserId: uA.id,
    })
    .returning();
  const [session] = await testDb
    .insert(drinkSessions)
    .values({ clubId: club!.id, openedByUserId: uA.id, startedAt: new Date() })
    .returning();
  // Alice's own consumption.
  const [cons] = await testDb
    .insert(consumptions)
    .values({
      clubId: club!.id,
      drinkSessionId: session!.id,
      memberId: mA.id,
      beerTypeId: beer!.id,
      unitPriceMinorSnapshot: 5000n,
      createdByUserId: uA.id,
    })
    .returning();
  return { club: club!, uA, uB, mA, mB, session: session! as DrinkSession, cons: cons! };
}

describe('tab query — voided-then-retransferred consumption does not fan out', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
  });

  it('winner tab shows the consumption once + total matches effective total', async () => {
    const { club, uA, uB, mA, mB, session, cons } = await seed();

    // Transfer 1 (A→B), then voided.
    const [t1] = await testDb
      .insert(betTransfers)
      .values({
        clubId: club.id,
        sourceConsumptionId: cons.id,
        fromMemberId: mA.id,
        toMemberId: mB.id,
        createdByUserId: uB.id,
      })
      .returning();
    await testDb.insert(betTransferVoids).values({
      clubId: club.id,
      betTransferId: t1!.id,
      voidedByUserId: uB.id,
    });

    // Transfer 2 (A→B), active (the re-transfer).
    await testDb.insert(betTransfers).values({
      clubId: club.id,
      sourceConsumptionId: cons.id,
      fromMemberId: mA.id,
      toMemberId: mB.id,
      createdByUserId: uB.id,
    });

    // Alice is the winner here (her beer's cost moved to Bob via the
    // active transfer) → effective total 0.
    const effA = await effectiveConsumptionTotal(mA.id, session.id);
    expect(effA).toBe(0n);

    const tabA = await getMyTabForSession({
      memberId: mA.id,
      userId: uA.id,
      session,
      undoWindowSeconds: 60,
    });
    // The single consumption must appear exactly once (no fan-out from
    // the two transfer rows).
    const rowsForCons = tabA.entries.filter((e) => e.id === cons.id);
    expect(rowsForCons.length).toBe(1);
    // And the total must agree with the effective total.
    expect(tabA.totalMinor).toBe(effA);
  });
});

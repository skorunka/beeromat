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
import { deliverBeerDebtTx } from '@/lib/db/queries/match-bet-debts';
import { getAllMemberBalances } from '@/lib/db/queries/payments';
import { memberBalance } from '@/lib/balance/calculate';
import { users } from '@/lib/db/schema/auth';
import { beerTypes } from '@/lib/db/schema/catalog';
import { clubs } from '@/lib/db/schema/clubs';
import { consumptions } from '@/lib/db/schema/consumption';
import { matchBetDebts } from '@/lib/db/schema/match-bet-debts';
import { members } from '@/lib/db/schema/members';
import { drinkSessions } from '@/lib/db/schema/sessions';

// Regression guard for the treasurer-dashboard / per-member balance
// DIVERGENCE: getAllMemberBalances must apply bet transfers the same
// way memberBalance does, otherwise the treasurer grid inverts who
// owes what after a for-beer match (winner appears to owe the won
// beer; loser appears to owe nothing).

async function seed() {
  const [club] = await testDb
    .insert(clubs)
    .values({ name: 'TC', currencyCode: 'CZK', defaultLocale: 'cs', matchLoserBeerCount: 1 })
    .returning();
  async function user(name: string) {
    const [u] = await testDb
      .insert(users)
      .values({ email: `${name}@x.test`, name, emailVerified: true })
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
        acceptedInvitationAt: new Date(),
      })
      .returning();
    return m!;
  }
  const uU = await user('U');
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
      createdByUserId: uU.id,
    })
    .returning();
  await testDb
    .insert(drinkSessions)
    .values({ clubId: club!.id, openedByUserId: uU.id, startedAt: new Date() });
  return { club: club!, uU, mA, mB, beer: beer! };
}

function gridBalance(rows: Awaited<ReturnType<typeof getAllMemberBalances>>, memberId: string) {
  return rows.find((r) => r.memberId === memberId)?.balanceMinor;
}

describe('getAllMemberBalances ⇄ memberBalance parity under bet transfers', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
  });

  it('after a for-beer singles match, the treasurer grid matches each member\'s own balance', async () => {
    const { club, uU, mA, mB } = await seed();

    const created = await createAgreementTx({
      clubId: club.id,
      createdByUserId: uU.id,
      input: {
        format: 'singles',
        forBeer: true,
        sides: { A: { seat1: mA.id }, B: { seat1: mB.id } },
      },
    });
    if (!created.ok) throw new Error('create agreement');
    const r = await recordResultTx({
      agreementId: created.agreementId,
      clubId: club.id,
      recordedByUserId: uU.id,
      winningSide: 'A',
    });
    if (!r.ok) throw new Error('record result');

    // Spec 030 — money moves on delivery; deliver the pending IOU.
    const [debt] = await testDb.select().from(matchBetDebts).where(eq(matchBetDebts.clubId, club.id));
    if (!debt) throw new Error('no debt');
    const d = await deliverBeerDebtTx({
      debtId: debt.id,
      clubId: club.id,
      actorUserId: uU.id,
      actorMemberId: mA.id,
      isElevated: false,
    });
    if (!d.ok) throw new Error('deliver: ' + d.code);

    // Canonical per-member balances (what each member sees on /tab + home).
    const canonA = await memberBalance(mA.id);
    const canonB = await memberBalance(mB.id);
    // FR-003: winner A nets to 0, loser B bears the 5000 beer.
    expect(canonA).toBe(0n);
    expect(canonB).toBe(5000n);

    // The treasurer's all-members grid MUST agree.
    const rows = await getAllMemberBalances(club.id);
    expect(gridBalance(rows, mA.id)).toBe(canonA);
    expect(gridBalance(rows, mB.id)).toBe(canonB);
  });

  it('a plain (non-transferred) consumption still matches between the two paths', async () => {
    const { club, uU, mA } = await seed();
    const session = await testDb
      .select()
      .from(drinkSessions)
      .where(eq(drinkSessions.clubId, club.id))
      .limit(1);
    const beer = await testDb
      .select()
      .from(beerTypes)
      .where(eq(beerTypes.clubId, club.id))
      .limit(1);
    await testDb.insert(consumptions).values({
      clubId: club.id,
      drinkSessionId: session[0]!.id,
      memberId: mA.id,
      beerTypeId: beer[0]!.id,
      unitPriceMinorSnapshot: 5000n,
      createdByUserId: uU.id,
    });

    const canon = await memberBalance(mA.id);
    const rows = await getAllMemberBalances(club.id);
    expect(gridBalance(rows, mA.id)).toBe(canon);
    expect(canon).toBe(5000n);
  });
});

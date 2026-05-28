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
import { getMyTabForSession, getMemberTabForAdmin } from '@/lib/db/queries/consumption';
import { effectiveConsumptionTotal, memberBalance } from '@/lib/balance/calculate';
import { users } from '@/lib/db/schema/auth';
import { beerTypes } from '@/lib/db/schema/catalog';
import { clubs } from '@/lib/db/schema/clubs';
import { members } from '@/lib/db/schema/members';
import { drinkSessions, type DrinkSession } from '@/lib/db/schema/sessions';

// The /tab screen total (getMyTabForSession.totalMinor) MUST equal
// the member's effectiveConsumptionTotal for that session, otherwise
// the line-item total disagrees with the balance shown in the header
// + on home. The interesting case is a for-beer match: the WINNER's
// auto-created consumption is transferred AWAY to the loser, so it
// must NOT count toward the winner's tab total.

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
  await testDb
    .insert(beerTypes)
    .values({
      clubId: club!.id,
      name: 'Pilsner',
      unitPriceMinor: 5000n,
      currentStock: 100,
      createdByUserId: uU.id,
    });
  const [session] = await testDb
    .insert(drinkSessions)
    .values({ clubId: club!.id, openedByUserId: uU.id, startedAt: new Date() })
    .returning();
  return { club: club!, uU, uA, uB, mA, mB, session: session! as DrinkSession };
}

describe('getMyTabForSession.totalMinor ⇄ effectiveConsumptionTotal parity', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
  });

  it('winner tab total matches their effective total after a for-beer match (transferred-away beer excluded)', async () => {
    const { club, uU, uA, mA, mB, session } = await seed();

    const created = await createAgreementTx({
      clubId: club.id,
      createdByUserId: uU.id,
      input: {
        format: 'singles',
        forBeer: true,
        sides: { A: { seat1: mA.id }, B: { seat1: mB.id } },
      },
    });
    if (!created.ok) throw new Error('create');
    const r = await recordResultTx({
      agreementId: created.agreementId,
      clubId: club.id,
      recordedByUserId: uU.id,
      winningSide: 'A',
    });
    if (!r.ok) throw new Error('record');

    // Winner A: balance + effective total are both 0 (beer moved to B).
    const effA = await effectiveConsumptionTotal(mA.id, session.id);
    expect(effA).toBe(0n);
    expect(await memberBalance(mA.id)).toBe(0n);

    // The /tab total must agree.
    const tabA = await getMyTabForSession({
      memberId: mA.id,
      userId: uA.id,
      session,
      undoWindowSeconds: 60,
    });
    expect(tabA.totalMinor).toBe(effA);
  });

  it('loser tab total matches their effective total (transferred-in beer included)', async () => {
    const { club, uU, uB, mA, mB, session } = await seed();
    const created = await createAgreementTx({
      clubId: club.id,
      createdByUserId: uU.id,
      input: {
        format: 'singles',
        forBeer: true,
        sides: { A: { seat1: mA.id }, B: { seat1: mB.id } },
      },
    });
    if (!created.ok) throw new Error('create');
    const r = await recordResultTx({
      agreementId: created.agreementId,
      clubId: club.id,
      recordedByUserId: uU.id,
      winningSide: 'A',
    });
    if (!r.ok) throw new Error('record');

    const effB = await effectiveConsumptionTotal(mB.id, session.id);
    expect(effB).toBe(5000n);
    const tabB = await getMyTabForSession({
      memberId: mB.id,
      userId: uB.id,
      session,
      undoWindowSeconds: 60,
    });
    expect(tabB.totalMinor).toBe(effB);
  });

  it('admin tab view total for the winner also matches the effective total', async () => {
    const { club, uU, mA, mB, session } = await seed();
    const created = await createAgreementTx({
      clubId: club.id,
      createdByUserId: uU.id,
      input: {
        format: 'singles',
        forBeer: true,
        sides: { A: { seat1: mA.id }, B: { seat1: mB.id } },
      },
    });
    if (!created.ok) throw new Error('create');
    const r = await recordResultTx({
      agreementId: created.agreementId,
      clubId: club.id,
      recordedByUserId: uU.id,
      winningSide: 'A',
    });
    if (!r.ok) throw new Error('record');

    const effA = await effectiveConsumptionTotal(mA.id, session.id);
    const adminTabA = await getMemberTabForAdmin({ memberId: mA.id, session });
    expect(adminTabA.totalMinor).toBe(effA);
  });
});

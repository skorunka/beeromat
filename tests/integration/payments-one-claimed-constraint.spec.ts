import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTestDb, type TestDb } from '../helpers/db';

let testDb: TestDb;

vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

async function seedClubMemberWithBalance(opts: {
  consumptionAmount: bigint;
}) {
  const { users } = await import('@/lib/db/schema/auth');
  const { clubs } = await import('@/lib/db/schema/clubs');
  const { members } = await import('@/lib/db/schema/members');
  const { beerTypes } = await import('@/lib/db/schema/catalog');
  const { drinkSessions } = await import('@/lib/db/schema/sessions');
  const { consumptions } = await import('@/lib/db/schema/consumption');
  const { payments } = await import('@/lib/db/schema/payments');

  const [user] = await testDb
    .insert(users)
    .values({ email: `m-${Date.now()}-${Math.random()}@example.test`, name: 'M' })
    .returning();
  if (!user) throw new Error('seed user');

  const [club] = await testDb
    .insert(clubs)
    .values({ name: 'Test', currencyCode: 'CZK', defaultLocale: 'cs-CZ' })
    .returning();
  if (!club) throw new Error('seed club');

  const [member] = await testDb
    .insert(members)
    .values({
      clubId: club.id,
      userId: user.id,
      email: user.email,
      displayName: 'M',
      role: 'member',
    })
    .returning();
  if (!member) throw new Error('seed member');

  // Seed enough debt so the member has a non-zero balance.
  const [beer] = await testDb
    .insert(beerTypes)
    .values({
      clubId: club.id,
      name: 'Pilsner',
      unitPriceMinor: opts.consumptionAmount,
      currentStock: 100,
      createdByUserId: user.id,
    })
    .returning();
  const [session] = await testDb
    .insert(drinkSessions)
    .values({ clubId: club.id, openedByUserId: user.id, startedAt: new Date() })
    .returning();
  await testDb.insert(consumptions).values({
    clubId: club.id,
    drinkSessionId: session!.id,
    memberId: member.id,
    beerTypeId: beer!.id,
    unitPriceMinorSnapshot: opts.consumptionAmount,
    createdByUserId: user.id,
  });

  return { user, club, member, payments };
}

describe('uniq_payments_member_one_claimed — spec 027 race protection', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
  });

  it('the partial unique index rejects a second claimed payment for the same member', async () => {
    const { member, payments } = await seedClubMemberWithBalance({
      consumptionAmount: 10000n,
    });
    const { user } = await seedClubMemberWithBalance({
      consumptionAmount: 0n,
    });

    // First claim — succeeds.
    await testDb.insert(payments).values({
      clubId: member.clubId,
      memberId: member.id,
      amountMinor: 5000n,
      currencyCode: 'CZK',
      status: 'claimed',
      origin: 'member_initiated',
      createdByUserId: user.id,
    });

    // Second claim for the same member — must violate the partial
    // unique constraint. Drizzle wraps the underlying Postgres error
    // in a DrizzleQueryError; the SQLSTATE + constraint name live
    // on `.cause` (we match the same shape the action does).
    let caught: unknown = null;
    try {
      await testDb.insert(payments).values({
        clubId: member.clubId,
        memberId: member.id,
        amountMinor: 5000n,
        currencyCode: 'CZK',
        status: 'claimed',
        origin: 'member_initiated',
        createdByUserId: user.id,
      });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeDefined();
    const cause = (caught as { cause?: { code?: string; constraint?: string } }).cause;
    expect(cause?.code).toBe('23505');
    expect(cause?.constraint).toBe('uniq_payments_member_one_claimed');
  });

  it('confirmed payments do NOT count toward the partial constraint (different status)', async () => {
    const { member, payments } = await seedClubMemberWithBalance({
      consumptionAmount: 10000n,
    });
    const { user } = await seedClubMemberWithBalance({
      consumptionAmount: 0n,
    });

    // First payment lands as confirmed (not claimed) — the partial
    // index only constrains the 'claimed' subset.
    await testDb.insert(payments).values({
      clubId: member.clubId,
      memberId: member.id,
      amountMinor: 5000n,
      currencyCode: 'CZK',
      status: 'confirmed',
      origin: 'member_initiated',
      createdByUserId: user.id,
    });

    // A subsequent claimed payment for the same member is fine
    // (no other claimed payment exists yet).
    await testDb.insert(payments).values({
      clubId: member.clubId,
      memberId: member.id,
      amountMinor: 5000n,
      currencyCode: 'CZK',
      status: 'claimed',
      origin: 'member_initiated',
      createdByUserId: user.id,
    });

    // No throw means the partial filter is correct.
    expect(true).toBe(true);
  });

  it('different members can each have one claimed payment (constraint is per-member)', async () => {
    const a = await seedClubMemberWithBalance({ consumptionAmount: 10000n });
    const b = await seedClubMemberWithBalance({ consumptionAmount: 10000n });

    await testDb.insert(a.payments).values({
      clubId: a.member.clubId,
      memberId: a.member.id,
      amountMinor: 5000n,
      currencyCode: 'CZK',
      status: 'claimed',
      origin: 'member_initiated',
      createdByUserId: a.user.id,
    });
    await testDb.insert(b.payments).values({
      clubId: b.member.clubId,
      memberId: b.member.id,
      amountMinor: 5000n,
      currencyCode: 'CZK',
      status: 'claimed',
      origin: 'member_initiated',
      createdByUserId: b.user.id,
    });

    expect(true).toBe(true);
  });
});

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
    club: { id: string; currencyCode: string };
  },
};

vi.mock('@/lib/auth/session', () => ({
  requireUnlocked: async () => ctxRef.current!,
}));

vi.mock('next/cache', () => ({
  revalidatePath: () => {},
}));

import { withdrawPaymentClaimAction } from '@/app/[locale]/(app)/settle/actions';
import { getMyBalance } from '@/lib/db/queries/payments';

async function seedMemberWithDebt(consumptionAmount: bigint) {
  const { users } = await import('@/lib/db/schema/auth');
  const { clubs } = await import('@/lib/db/schema/clubs');
  const { members } = await import('@/lib/db/schema/members');
  const { beerTypes } = await import('@/lib/db/schema/catalog');
  const { drinkSessions } = await import('@/lib/db/schema/sessions');
  const { consumptions } = await import('@/lib/db/schema/consumption');

  const [user] = await testDb
    .insert(users)
    .values({ email: `m-${Date.now()}-${Math.random()}@example.test`, name: 'M' })
    .returning();
  const [club] = await testDb
    .insert(clubs)
    .values({ name: 'Test', currencyCode: 'CZK', defaultLocale: 'cs-CZ' })
    .returning();
  const [member] = await testDb
    .insert(members)
    .values({
      clubId: club!.id,
      userId: user!.id,
      email: user!.email,
      displayName: 'M',
      role: 'member',
    })
    .returning();
  const [beer] = await testDb
    .insert(beerTypes)
    .values({
      clubId: club!.id,
      name: 'Pilsner',
      unitPriceMinor: consumptionAmount,
      currentStock: 100,
      createdByUserId: user!.id,
    })
    .returning();
  const [session] = await testDb
    .insert(drinkSessions)
    .values({ clubId: club!.id, openedByUserId: user!.id, startedAt: new Date() })
    .returning();
  await testDb.insert(consumptions).values({
    clubId: club!.id,
    drinkSessionId: session!.id,
    memberId: member!.id,
    beerTypeId: beer!.id,
    unitPriceMinorSnapshot: consumptionAmount,
    createdByUserId: user!.id,
  });

  ctxRef.current = {
    user: { id: user!.id },
    member: { id: member!.id, role: 'member' },
    club: { id: club!.id, currencyCode: 'CZK' },
  };
  return { user: user!, club: club!, member: member! };
}

describe('withdrawPaymentClaimAction', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
    ctxRef.current = null;
  });

  it('withdraws a claimed payment: → voided + audit transition, balance intact, pending back to 0', async () => {
    const { payments, paymentStateTransitions } = await import('@/lib/db/schema/payments');
    const { user, club, member } = await seedMemberWithDebt(10000n);

    const [claim] = await testDb
      .insert(payments)
      .values({
        clubId: club.id,
        memberId: member.id,
        amountMinor: 10000n,
        currencyCode: 'CZK',
        status: 'claimed',
        origin: 'member_initiated',
        createdByUserId: user.id,
      })
      .returning();

    const before = await getMyBalance(member.id, 'CZK');
    expect(before.balanceMinor).toBe(10000n);
    expect(before.pendingConfirmationMinor).toBe(10000n);

    const result = await withdrawPaymentClaimAction();
    expect(result.ok).toBe(true);

    const row = await testDb.query.payments.findFirst({ where: eq(payments.id, claim!.id) });
    expect(row?.status).toBe('voided');

    const transitions = await testDb
      .select()
      .from(paymentStateTransitions)
      .where(eq(paymentStateTransitions.paymentId, claim!.id));
    expect(transitions).toHaveLength(1);
    expect(transitions[0]?.fromStatus).toBe('claimed');
    expect(transitions[0]?.toStatus).toBe('voided');
    expect(transitions[0]?.reason).toBe('withdrawn_by_member');

    // Balance unchanged (voided ≠ a payment); pending cleared, so the
    // member can settle again.
    const after = await getMyBalance(member.id, 'CZK');
    expect(after.balanceMinor).toBe(10000n);
    expect(after.pendingConfirmationMinor).toBe(0n);
  });

  it('returns NO_CLAIM when there is no pending claim', async () => {
    await seedMemberWithDebt(10000n);
    const result = await withdrawPaymentClaimAction();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NO_CLAIM');
  });

  it('does not touch a payment the treasurer already confirmed', async () => {
    const { payments } = await import('@/lib/db/schema/payments');
    const { user, club, member } = await seedMemberWithDebt(10000n);

    const [claim] = await testDb
      .insert(payments)
      .values({
        clubId: club.id,
        memberId: member.id,
        amountMinor: 10000n,
        currencyCode: 'CZK',
        status: 'confirmed', // treasurer got there first
        origin: 'member_initiated',
        createdByUserId: user.id,
      })
      .returning();

    const result = await withdrawPaymentClaimAction();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NO_CLAIM');

    const row = await testDb.query.payments.findFirst({ where: eq(payments.id, claim!.id) });
    expect(row?.status).toBe('confirmed');
  });
});

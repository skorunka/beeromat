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
  requireRole: async () => ctxRef.current!,
}));

vi.mock('next/cache', () => ({
  revalidatePath: () => {},
}));

import { bulkConfirmPaymentsAction } from '@/app/[locale]/(app)/admin/pending/actions';

async function seedClubWithTreasurer() {
  const { users } = await import('@/lib/db/schema/auth');
  const { clubs } = await import('@/lib/db/schema/clubs');
  const { members } = await import('@/lib/db/schema/members');

  const [user] = await testDb
    .insert(users)
    .values({ email: `t-${Date.now()}-${Math.random()}@example.test`, name: 'T' })
    .returning();
  if (!user) throw new Error('seed user');
  const [club] = await testDb
    .insert(clubs)
    .values({ name: 'Test', currencyCode: 'CZK', defaultLocale: 'cs-CZ' })
    .returning();
  if (!club) throw new Error('seed club');
  const [treasurer] = await testDb
    .insert(members)
    .values({
      clubId: club.id,
      userId: user.id,
      email: user.email,
      displayName: 'T',
      role: 'treasurer',
    })
    .returning();
  if (!treasurer) throw new Error('seed treasurer');
  return { user, club, treasurer };
}

async function seedPaymentMember(clubId: string, name: string) {
  const { users } = await import('@/lib/db/schema/auth');
  const { members } = await import('@/lib/db/schema/members');
  const [user] = await testDb
    .insert(users)
    .values({ email: `${name}-${Date.now()}-${Math.random()}@example.test`, name })
    .returning();
  const [member] = await testDb
    .insert(members)
    .values({
      clubId,
      userId: user!.id,
      email: user!.email,
      displayName: name,
      role: 'member',
    })
    .returning();
  return member!;
}

async function seedPayment(
  clubId: string,
  memberId: string,
  createdBy: string,
  status: 'claimed' | 'confirmed' | 'disputed' = 'claimed',
) {
  const { payments } = await import('@/lib/db/schema/payments');
  const [row] = await testDb
    .insert(payments)
    .values({
      clubId,
      memberId,
      amountMinor: 5000n,
      currencyCode: 'CZK',
      status,
      origin: 'member_initiated',
      createdByUserId: createdBy,
    })
    .returning();
  return row!;
}

describe('bulkConfirmPaymentsAction', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
    ctxRef.current = null;
  });

  it('happy path — confirms every claimed payment, skips nothing', async () => {
    const { user, club, treasurer } = await seedClubWithTreasurer();
    const m1 = await seedPaymentMember(club.id, 'm1');
    const m2 = await seedPaymentMember(club.id, 'm2');
    const m3 = await seedPaymentMember(club.id, 'm3');
    const p1 = await seedPayment(club.id, m1.id, user.id);
    const p2 = await seedPayment(club.id, m2.id, user.id);
    const p3 = await seedPayment(club.id, m3.id, user.id);

    ctxRef.current = {
      user: { id: user.id },
      member: { id: treasurer.id, role: 'treasurer' },
      club: { id: club.id },
    };
    const result = await bulkConfirmPaymentsAction([p1.id, p2.id, p3.id]);
    expect(result.confirmed.sort()).toEqual([p1.id, p2.id, p3.id].sort());
    expect(result.skipped).toEqual([]);

    // Sanity: rows are now confirmed in the db.
    const { payments } = await import('@/lib/db/schema/payments');
    const { eq } = await import('drizzle-orm');
    const fresh = await testDb.query.payments.findFirst({ where: eq(payments.id, p1.id) });
    expect(fresh?.status).toBe('confirmed');
  });

  it('mixed batch — confirms claimed, skips already-confirmed (INVALID_STATE) without aborting', async () => {
    const { user, club, treasurer } = await seedClubWithTreasurer();
    const m1 = await seedPaymentMember(club.id, 'm1');
    const m2 = await seedPaymentMember(club.id, 'm2');
    const claimed = await seedPayment(club.id, m1.id, user.id, 'claimed');
    const already = await seedPayment(club.id, m2.id, user.id, 'confirmed');

    ctxRef.current = {
      user: { id: user.id },
      member: { id: treasurer.id, role: 'treasurer' },
      club: { id: club.id },
    };
    const result = await bulkConfirmPaymentsAction([claimed.id, already.id]);
    expect(result.confirmed).toEqual([claimed.id]);
    expect(result.skipped).toEqual([
      { paymentId: already.id, reason: 'INVALID_STATE' },
    ]);
  });

  it('unknown id falls into skipped as NOT_FOUND', async () => {
    const { user, club, treasurer } = await seedClubWithTreasurer();
    const m1 = await seedPaymentMember(club.id, 'm1');
    const claimed = await seedPayment(club.id, m1.id, user.id);

    ctxRef.current = {
      user: { id: user.id },
      member: { id: treasurer.id, role: 'treasurer' },
      club: { id: club.id },
    };
    const ghost = '00000000-0000-0000-0000-000000000000';
    const result = await bulkConfirmPaymentsAction([claimed.id, ghost]);
    expect(result.confirmed).toEqual([claimed.id]);
    expect(result.skipped).toEqual([{ paymentId: ghost, reason: 'NOT_FOUND' }]);
  });

  it('cross-club payment id is invisible — reported as NOT_FOUND (Principle II)', async () => {
    const a = await seedClubWithTreasurer();
    const b = await seedClubWithTreasurer();
    const bMember = await seedPaymentMember(b.club.id, 'bm');
    const bPayment = await seedPayment(b.club.id, bMember.id, b.user.id);

    // Treasurer of club A tries to bulk-confirm a payment in club B.
    ctxRef.current = {
      user: { id: a.user.id },
      member: { id: a.treasurer.id, role: 'treasurer' },
      club: { id: a.club.id },
    };
    const result = await bulkConfirmPaymentsAction([bPayment.id]);
    expect(result.confirmed).toEqual([]);
    expect(result.skipped).toEqual([{ paymentId: bPayment.id, reason: 'NOT_FOUND' }]);

    // And the foreign payment is NOT touched.
    const { payments } = await import('@/lib/db/schema/payments');
    const { eq } = await import('drizzle-orm');
    const fresh = await testDb.query.payments.findFirst({ where: eq(payments.id, bPayment.id) });
    expect(fresh?.status).toBe('claimed');
  });

  it('empty array — Zod min(1) rejects', async () => {
    const { user, club, treasurer } = await seedClubWithTreasurer();
    ctxRef.current = {
      user: { id: user.id },
      member: { id: treasurer.id, role: 'treasurer' },
      club: { id: club.id },
    };
    await expect(bulkConfirmPaymentsAction([])).rejects.toThrow();
  });
});

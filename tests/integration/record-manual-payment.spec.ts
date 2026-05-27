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
    club: { id: string; currencyCode: string };
  },
};

vi.mock('@/lib/auth/session', () => ({
  requireRole: async () => ctxRef.current!,
  requireUnlocked: async () => ctxRef.current!,
}));

vi.mock('next/cache', () => ({
  revalidatePath: () => {},
}));

import { recordManualPaymentAction } from '@/app/[locale]/(app)/admin/balances/actions';

async function seedClubWithTreasurer() {
  const { users } = await import('@/lib/db/schema/auth');
  const { clubs } = await import('@/lib/db/schema/clubs');
  const { members } = await import('@/lib/db/schema/members');

  const [user] = await testDb
    .insert(users)
    .values({ email: `treas-${Date.now()}-${Math.random()}@example.test`, name: 'T' })
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

async function seedPayer(clubId: string, label: string) {
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
      role: 'member',
    })
    .returning();
  if (!m) throw new Error('seed member');
  return { u, m };
}

async function readPayment(id: string) {
  const { eq } = await import('drizzle-orm');
  const { payments } = await import('@/lib/db/schema/payments');
  return testDb.query.payments.findFirst({ where: eq(payments.id, id) });
}

async function readTransitions(paymentId: string) {
  const { eq } = await import('drizzle-orm');
  const { paymentStateTransitions } = await import('@/lib/db/schema/payments');
  return testDb.query.paymentStateTransitions.findMany({
    where: eq(paymentStateTransitions.paymentId, paymentId),
  });
}

describe('recordManualPaymentAction', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
    ctxRef.current = null;
  });

  it('records a confirmed treasurer-initiated payment + state-transition row', async () => {
    const { user: treasUser, club, treasurer } = await seedClubWithTreasurer();
    const { m: payer } = await seedPayer(club.id, 'pavel');
    ctxRef.current = {
      user: { id: treasUser.id },
      member: { id: treasurer.id, role: 'treasurer' },
      club: { id: club.id, currencyCode: 'CZK' },
    };

    const result = await recordManualPaymentAction({
      memberId: payer.id,
      amountMinor: '5000',
      note: 'cash at the bar',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const payment = await readPayment(result.paymentId);
    expect(payment?.status).toBe('confirmed');
    expect(payment?.origin).toBe('treasurer_initiated');
    expect(payment?.amountMinor).toBe(5000n);
    expect(payment?.note).toBe('cash at the bar');
    expect(payment?.variableSymbol).toBeNull();

    const transitions = await readTransitions(payment!.id);
    expect(transitions).toHaveLength(1);
    expect(transitions[0]?.fromStatus).toBeNull(); // direct landing on confirmed
    expect(transitions[0]?.toStatus).toBe('confirmed');
    expect(transitions[0]?.reason).toBe('cash at the bar');
  });

  it('omitted note is stored as null', async () => {
    const { user: treasUser, club, treasurer } = await seedClubWithTreasurer();
    const { m: payer } = await seedPayer(club.id, 'pavel');
    ctxRef.current = {
      user: { id: treasUser.id },
      member: { id: treasurer.id, role: 'treasurer' },
      club: { id: club.id, currencyCode: 'CZK' },
    };

    const result = await recordManualPaymentAction({
      memberId: payer.id,
      amountMinor: '3000',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((await readPayment(result.paymentId))?.note).toBeNull();
  });

  it('whitespace-only note is stored as null', async () => {
    const { user: treasUser, club, treasurer } = await seedClubWithTreasurer();
    const { m: payer } = await seedPayer(club.id, 'pavel');
    ctxRef.current = {
      user: { id: treasUser.id },
      member: { id: treasurer.id, role: 'treasurer' },
      club: { id: club.id, currencyCode: 'CZK' },
    };

    const result = await recordManualPaymentAction({
      memberId: payer.id,
      amountMinor: '3000',
      note: '   ',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((await readPayment(result.paymentId))?.note).toBeNull();
  });

  it('INVALID_INPUT on zero amount', async () => {
    const { user: treasUser, club, treasurer } = await seedClubWithTreasurer();
    const { m: payer } = await seedPayer(club.id, 'pavel');
    ctxRef.current = {
      user: { id: treasUser.id },
      member: { id: treasurer.id, role: 'treasurer' },
      club: { id: club.id, currencyCode: 'CZK' },
    };

    const result = await recordManualPaymentAction({
      memberId: payer.id,
      amountMinor: '0',
    });
    expect(result).toEqual({ ok: false, code: 'INVALID_INPUT' });
  });

  it('NOT_FOUND on cross-club member id', async () => {
    const a = await seedClubWithTreasurer();
    const b = await seedClubWithTreasurer();
    const { m: bPayer } = await seedPayer(b.club.id, 'cross');

    ctxRef.current = {
      user: { id: a.user.id },
      member: { id: a.treasurer.id, role: 'treasurer' },
      club: { id: a.club.id, currencyCode: 'CZK' },
    };
    const result = await recordManualPaymentAction({
      memberId: bPayer.id,
      amountMinor: '5000',
    });
    expect(result).toEqual({ ok: false, code: 'NOT_FOUND' });
  });

  it('allows recording a manual payment even when the member has a pending claimed payment', async () => {
    // The partial unique index uniq_payments_member_one_claimed
    // constrains only the 'claimed' status. A treasurer can still
    // record a 'confirmed' payment for the same member even if a
    // claimed one is pending (e.g. treasurer received cash + the
    // member also submitted a bank claim — both rows valid, the
    // treasurer can dispute the claimed one later).
    const { payments } = await import('@/lib/db/schema/payments');
    const { user: treasUser, club, treasurer } = await seedClubWithTreasurer();
    const { m: payer } = await seedPayer(club.id, 'pavel');

    // Pre-seed a claimed payment for the same member.
    await testDb.insert(payments).values({
      clubId: club.id,
      memberId: payer.id,
      amountMinor: 5000n,
      currencyCode: 'CZK',
      status: 'claimed',
      origin: 'member_initiated',
      createdByUserId: treasUser.id,
    });

    ctxRef.current = {
      user: { id: treasUser.id },
      member: { id: treasurer.id, role: 'treasurer' },
      club: { id: club.id, currencyCode: 'CZK' },
    };
    const result = await recordManualPaymentAction({
      memberId: payer.id,
      amountMinor: '5000',
      note: 'received cash separately',
    });
    expect(result.ok).toBe(true);
  });
});

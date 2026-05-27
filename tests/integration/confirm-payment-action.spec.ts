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
  // Both requireRole AND requireUnlocked work the same way for our
  // ctx shape — the role check itself is exercised by the action
  // body; here we always provide a treasurer ctx.
  requireRole: async () => ctxRef.current!,
  requireUnlocked: async () => ctxRef.current!,
}));

vi.mock('next/cache', () => ({
  revalidatePath: () => {},
}));

import {
  confirmPaymentAction,
  disputePaymentAction,
  voidConfirmedPaymentAction,
} from '@/app/[locale]/(app)/admin/pending/actions';

async function seedClubAndTreasurer() {
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

  const [member] = await testDb
    .insert(members)
    .values({
      clubId: club.id,
      userId: user.id,
      email: user.email,
      displayName: 'T',
      role: 'treasurer',
    })
    .returning();
  if (!member) throw new Error('seed member');

  return { user, club, member };
}

async function seedClaimedPayment(opts: {
  clubId: string;
  memberId: string;
  createdByUserId: string;
}) {
  const { payments } = await import('@/lib/db/schema/payments');
  const [p] = await testDb
    .insert(payments)
    .values({
      clubId: opts.clubId,
      memberId: opts.memberId,
      amountMinor: 5000n,
      currencyCode: 'CZK',
      status: 'claimed',
      origin: 'member_initiated',
      createdByUserId: opts.createdByUserId,
    })
    .returning();
  if (!p) throw new Error('seed payment');
  return p;
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

describe('confirmPaymentAction', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
    ctxRef.current = null;
  });

  it('happy path — claimed → confirmed + state-transition row created', async () => {
    const { user, club, member } = await seedClubAndTreasurer();
    const payment = await seedClaimedPayment({
      clubId: club.id,
      memberId: member.id,
      createdByUserId: user.id,
    });
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'treasurer' },
      club: { id: club.id },
    };

    const result = await confirmPaymentAction(payment.id);
    expect(result).toEqual({ ok: true });

    const updated = await readPayment(payment.id);
    expect(updated?.status).toBe('confirmed');

    const transitions = await readTransitions(payment.id);
    expect(transitions).toHaveLength(1);
    expect(transitions[0]?.fromStatus).toBe('claimed');
    expect(transitions[0]?.toStatus).toBe('confirmed');
    expect(transitions[0]?.createdByUserId).toBe(user.id);
  });

  it('INVALID_STATE when the payment is no longer claimed', async () => {
    const { user, club, member } = await seedClubAndTreasurer();
    const payment = await seedClaimedPayment({
      clubId: club.id,
      memberId: member.id,
      createdByUserId: user.id,
    });
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'treasurer' },
      club: { id: club.id },
    };

    // First call confirms.
    await confirmPaymentAction(payment.id);
    // Second call sees the payment as confirmed → INVALID_STATE.
    const second = await confirmPaymentAction(payment.id);
    expect(second).toEqual({ ok: false, code: 'INVALID_STATE' });
  });

  it('NOT_FOUND when the payment id is from a different club', async () => {
    const a = await seedClubAndTreasurer();
    const b = await seedClubAndTreasurer();
    const bPayment = await seedClaimedPayment({
      clubId: b.club.id,
      memberId: b.member.id,
      createdByUserId: b.user.id,
    });
    // Treasurer A tries to confirm B's payment.
    ctxRef.current = {
      user: { id: a.user.id },
      member: { id: a.member.id, role: 'treasurer' },
      club: { id: a.club.id },
    };
    const result = await confirmPaymentAction(bPayment.id);
    expect(result).toEqual({ ok: false, code: 'NOT_FOUND' });
    // Cross-club row untouched.
    expect((await readPayment(bPayment.id))?.status).toBe('claimed');
  });

  it('NOT_FOUND when the id is not a UUID', async () => {
    const { user, club, member } = await seedClubAndTreasurer();
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'treasurer' },
      club: { id: club.id },
    };
    const result = await confirmPaymentAction('not-a-uuid');
    expect(result).toEqual({ ok: false, code: 'NOT_FOUND' });
  });
});

describe('disputePaymentAction', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
    ctxRef.current = null;
  });

  it('claimed → disputed with reason logged', async () => {
    const { user, club, member } = await seedClubAndTreasurer();
    const payment = await seedClaimedPayment({
      clubId: club.id,
      memberId: member.id,
      createdByUserId: user.id,
    });
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'treasurer' },
      club: { id: club.id },
    };

    const result = await disputePaymentAction({
      paymentId: payment.id,
      reason: 'no matching bank entry',
    });
    expect(result).toEqual({ ok: true });

    const updated = await readPayment(payment.id);
    expect(updated?.status).toBe('disputed');

    const transitions = await readTransitions(payment.id);
    expect(transitions[0]?.toStatus).toBe('disputed');
    expect(transitions[0]?.reason).toBe('no matching bank entry');
  });

  it('rejects a confirmed payment with INVALID_STATE', async () => {
    const { user, club, member } = await seedClubAndTreasurer();
    const payment = await seedClaimedPayment({
      clubId: club.id,
      memberId: member.id,
      createdByUserId: user.id,
    });
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'treasurer' },
      club: { id: club.id },
    };
    await confirmPaymentAction(payment.id); // claimed → confirmed
    const result = await disputePaymentAction({
      paymentId: payment.id,
      reason: 'too late',
    });
    expect(result).toEqual({ ok: false, code: 'INVALID_STATE' });
  });
});

describe('voidConfirmedPaymentAction', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
    ctxRef.current = null;
  });

  it('confirmed → voided with reason logged + balance restored', async () => {
    const { user, club, member } = await seedClubAndTreasurer();
    const payment = await seedClaimedPayment({
      clubId: club.id,
      memberId: member.id,
      createdByUserId: user.id,
    });
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'treasurer' },
      club: { id: club.id },
    };
    await confirmPaymentAction(payment.id);
    const result = await voidConfirmedPaymentAction({
      paymentId: payment.id,
      reason: 'duplicate confirmation',
    });
    expect(result).toEqual({ ok: true });

    const updated = await readPayment(payment.id);
    expect(updated?.status).toBe('voided');

    const transitions = await readTransitions(payment.id);
    expect(transitions).toHaveLength(2); // claimed→confirmed then confirmed→voided
    const last = transitions.find((t) => t.toStatus === 'voided');
    expect(last?.reason).toBe('duplicate confirmation');
  });

  it('rejects a still-claimed payment with INVALID_STATE', async () => {
    const { user, club, member } = await seedClubAndTreasurer();
    const payment = await seedClaimedPayment({
      clubId: club.id,
      memberId: member.id,
      createdByUserId: user.id,
    });
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'treasurer' },
      club: { id: club.id },
    };
    // Skip confirmation — payment is still 'claimed'.
    const result = await voidConfirmedPaymentAction({
      paymentId: payment.id,
      reason: 'wrong action',
    });
    expect(result).toEqual({ ok: false, code: 'INVALID_STATE' });
  });
});

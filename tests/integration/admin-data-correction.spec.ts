import { beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';

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
    club: { id: string; consumptionUndoWindowSeconds: number; currencyCode: string };
  },
};

vi.mock('@/lib/auth/session', () => ({
  requireMember: async () => ctxRef.current!,
  requireRole: async () => ctxRef.current!,
  requireUnlocked: async () => ctxRef.current!,
}));

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { voidConsumptionAction } from '@/app/[locale]/(app)/log/actions';
import { voidConfirmedPaymentAction } from '@/app/[locale]/(app)/admin/pending/actions';
import { getMemberChargesForAdmin } from '@/lib/db/queries/consumption';
import { getMemberConfirmedPayments } from '@/lib/db/queries/payments';
import { memberBalance } from '@/lib/balance/calculate';
import { users } from '@/lib/db/schema/auth';
import { clubs } from '@/lib/db/schema/clubs';
import { members } from '@/lib/db/schema/members';
import { beerTypes } from '@/lib/db/schema/catalog';
import { consumptions, consumptionVoids } from '@/lib/db/schema/consumption';
import { drinkSessions } from '@/lib/db/schema/sessions';
import { payments } from '@/lib/db/schema/payments';

const PRICE = 4500n;

async function mkUser(name: string) {
  const [u] = await testDb
    .insert(users)
    .values({ email: `${name}-${Math.random()}@x.test`, name, emailVerified: true })
    .returning();
  return u!;
}

async function seedClub(name: string) {
  const [club] = await testDb
    .insert(clubs)
    .values({ name, currencyCode: 'CZK', defaultLocale: 'cs' })
    .returning();
  const adminUser = await mkUser(`${name}-admin`);
  const targetUser = await mkUser(`${name}-target`);
  const [admin] = await testDb
    .insert(members)
    .values({
      clubId: club!.id,
      userId: adminUser.id,
      email: adminUser.email,
      displayName: `${name}-admin`,
      role: 'club_admin',
      acceptedInvitationAt: new Date(),
    })
    .returning();
  const [target] = await testDb
    .insert(members)
    .values({
      clubId: club!.id,
      userId: targetUser.id,
      email: targetUser.email,
      displayName: `${name}-target`,
      role: 'member',
      acceptedInvitationAt: new Date(),
    })
    .returning();
  const [beer] = await testDb
    .insert(beerTypes)
    .values({
      clubId: club!.id,
      name: 'Pilsner',
      unitPriceMinor: PRICE,
      currentStock: 100,
      createdByUserId: adminUser.id,
    })
    .returning();
  const [session] = await testDb
    .insert(drinkSessions)
    .values({ clubId: club!.id, startedAt: new Date(), openedByUserId: adminUser.id })
    .returning();
  return {
    club: club!,
    user: adminUser,
    target: target!,
    admin: admin!,
    beer: beer!,
    session: session!,
  };
}

async function addConsumption(c: Awaited<ReturnType<typeof seedClub>>) {
  const [row] = await testDb
    .insert(consumptions)
    .values({
      clubId: c.club.id,
      drinkSessionId: c.session.id,
      memberId: c.target.id,
      beerTypeId: c.beer.id,
      unitPriceMinorSnapshot: PRICE,
      createdByUserId: c.user.id,
    })
    .returning();
  return row!;
}

async function addConfirmedPayment(c: Awaited<ReturnType<typeof seedClub>>, amount = PRICE) {
  const [row] = await testDb
    .insert(payments)
    .values({
      clubId: c.club.id,
      memberId: c.target.id,
      amountMinor: amount,
      currencyCode: 'CZK',
      status: 'confirmed',
      origin: 'treasurer_initiated',
      createdByUserId: c.user.id,
    })
    .returning();
  return row!;
}

function actAsAdmin(c: Awaited<ReturnType<typeof seedClub>>) {
  ctxRef.current = {
    user: { id: c.user.id },
    member: { id: c.admin.id, role: 'club_admin' },
    club: { id: c.club.id, consumptionUndoWindowSeconds: 300, currencyCode: 'CZK' },
  };
}

describe('admin data correction (spec 031)', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
    ctxRef.current = null;
  });

  it('getMemberChargesForAdmin returns non-voided own consumptions, club-scoped', async () => {
    const a = await seedClub('A');
    const b = await seedClub('B');
    const c1 = await addConsumption(a);
    await addConsumption(a);
    await addConsumption(b); // other club — must be excluded
    // Void one of A's directly.
    await testDb
      .insert(consumptionVoids)
      .values({ clubId: a.club.id, consumptionId: c1.id, voidedByUserId: a.user.id });

    const charges = await getMemberChargesForAdmin(a.target.id, a.club.id);
    expect(charges).toHaveLength(1); // 2 created, 1 voided
    expect(charges[0]!.beerTypeName).toBe('Pilsner');
  });

  it('getMemberConfirmedPayments returns only confirmed, club-scoped', async () => {
    const a = await seedClub('A');
    await addConfirmedPayment(a);
    // A claimed (not confirmed) payment must be excluded.
    await testDb.insert(payments).values({
      clubId: a.club.id,
      memberId: a.target.id,
      amountMinor: 999n,
      currencyCode: 'CZK',
      status: 'claimed',
      origin: 'member_initiated',
      createdByUserId: a.user.id,
    });
    const confirmed = await getMemberConfirmedPayments(a.target.id, a.club.id);
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0]!.amountMinor).toBe(PRICE);
  });

  it('admin voids a settled consumption → member goes into credit; idempotent', async () => {
    const a = await seedClub('A');
    const cons = await addConsumption(a);
    await addConfirmedPayment(a); // paid for that beer → balance 0
    expect(await memberBalance(a.target.id)).toBe(0n);

    actAsAdmin(a);
    const result = await voidConsumptionAction({ consumptionId: cons.id });
    expect(result.ok).toBe(true);

    // Charge gone, payment remains → member overpaid → credit (negative).
    expect(await memberBalance(a.target.id)).toBe(-PRICE);
    // Stock restored (+1 over the seeded 100).
    const beer = await testDb.query.beerTypes.findFirst({ where: eq(beerTypes.id, a.beer.id) });
    expect(beer!.currentStock).toBe(101);

    // Idempotent: second void is rejected, nothing changes.
    const second = await voidConsumptionAction({ consumptionId: cons.id });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe('ALREADY_VOIDED');
    expect(await memberBalance(a.target.id)).toBe(-PRICE);
  });

  it('admin reverses a confirmed payment → owed balance rises; idempotent', async () => {
    const a = await seedClub('A');
    await addConsumption(a); // owes PRICE
    const pay = await addConfirmedPayment(a); // paid → balance 0
    expect(await memberBalance(a.target.id)).toBe(0n);

    actAsAdmin(a);
    const result = await voidConfirmedPaymentAction({ paymentId: pay.id, reason: 'admin-correction' });
    expect(result.ok).toBe(true);

    // Payment reversed → member owes PRICE again.
    expect(await memberBalance(a.target.id)).toBe(PRICE);
    const reloaded = await testDb.query.payments.findFirst({ where: eq(payments.id, pay.id) });
    expect(reloaded!.status).toBe('voided');

    // Idempotent: second reverse → INVALID_STATE, nothing changes.
    const second = await voidConfirmedPaymentAction({ paymentId: pay.id, reason: 'admin-correction' });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe('INVALID_STATE');
    expect(await memberBalance(a.target.id)).toBe(PRICE);
  });

  it('cannot reverse a payment from another club (club-scoped)', async () => {
    const a = await seedClub('A');
    const b = await seedClub('B');
    const payB = await addConfirmedPayment(b);

    actAsAdmin(a); // admin of club A
    const result = await voidConfirmedPaymentAction({ paymentId: payB.id, reason: 'x' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_FOUND');
  });
});

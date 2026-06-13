import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { makeTestDb, type TestDb } from '../helpers/db';

// Admin hard-delete of a fake/test charge: removes the consumption row
// outright, restores stock +1 (audited as an adjustment), refuses
// match-derived rows, and enforces club_admin + club scope in the action.

let testDb: TestDb;
vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

const ctxRef = {
  current: null as null | {
    user: { id: string };
    member: { id: string; role: 'member' | 'stock_manager' | 'treasurer' | 'club_admin' };
    club: { id: string };
  },
};
vi.mock('@/lib/auth/session', () => ({
  requireUnlocked: async () => ctxRef.current!,
  requireMember: async () => ctxRef.current!,
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('@/lib/balance/calculate', () => ({ memberBalance: async () => 0n }));

import { hardDeleteConsumptionAction } from '@/app/[locale]/(app)/log/actions';
import { users } from '@/lib/db/schema/auth';
import { clubs } from '@/lib/db/schema/clubs';
import { members } from '@/lib/db/schema/members';
import { beerTypes, stockChanges } from '@/lib/db/schema/catalog';
import { consumptions } from '@/lib/db/schema/consumption';
import { betTransfers } from '@/lib/db/schema/bets';
import { drinkSessions } from '@/lib/db/schema/sessions';

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
      currentStock: 99,
      createdByUserId: adminUser.id,
    })
    .returning();
  const [session] = await testDb
    .insert(drinkSessions)
    .values({ clubId: club!.id, startedAt: new Date(), openedByUserId: adminUser.id })
    .returning();
  return {
    club: club!,
    adminUser,
    admin: admin!,
    target: target!,
    beer: beer!,
    session: session!,
  };
}

type Seed = Awaited<ReturnType<typeof seedClub>>;

async function addConsumption(c: Seed) {
  const [row] = await testDb
    .insert(consumptions)
    .values({
      clubId: c.club.id,
      drinkSessionId: c.session.id,
      memberId: c.target.id,
      beerTypeId: c.beer.id,
      unitPriceMinorSnapshot: PRICE,
      createdByUserId: c.target.userId,
    })
    .returning();
  return row!;
}

function asAdmin(c: Seed) {
  ctxRef.current = {
    user: { id: c.adminUser.id },
    member: { id: c.admin.id, role: 'club_admin' },
    club: { id: c.club.id },
  };
}

describe('hardDeleteConsumptionAction (admin data correction)', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
  });

  it('permanently deletes the row and restores stock +1 (audited)', async () => {
    const a = await seedClub('A');
    const con = await addConsumption(a);
    asAdmin(a);

    const result = await hardDeleteConsumptionAction({ consumptionId: con.id });
    expect(result.ok).toBe(true);

    const remaining = await testDb.query.consumptions.findFirst({
      where: eq(consumptions.id, con.id),
    });
    expect(remaining).toBeUndefined();

    const beer = await testDb.query.beerTypes.findFirst({ where: eq(beerTypes.id, a.beer.id) });
    expect(beer!.currentStock).toBe(100); // 99 → 100

    const audit = await testDb
      .select()
      .from(stockChanges)
      .where(eq(stockChanges.beerTypeId, a.beer.id));
    expect(audit).toHaveLength(1);
    expect(audit[0]!.kind).toBe('adjustment');
    expect(audit[0]!.delta).toBe(1);
    expect(audit[0]!.reason).toBe('admin-hard-delete');
  });

  it('refuses a match-derived consumption (MATCH_LINKED), leaving it intact', async () => {
    const a = await seedClub('A');
    const con = await addConsumption(a);
    await testDb.insert(betTransfers).values({
      clubId: a.club.id,
      sourceConsumptionId: con.id,
      fromMemberId: a.target.id,
      toMemberId: a.admin.id,
      createdByUserId: a.adminUser.id,
    });
    asAdmin(a);

    const result = await hardDeleteConsumptionAction({ consumptionId: con.id });
    expect(result).toEqual({ ok: false, code: 'MATCH_LINKED' });

    const remaining = await testDb.query.consumptions.findFirst({
      where: eq(consumptions.id, con.id),
    });
    expect(remaining).toBeDefined();
    // stock untouched
    const beer = await testDb.query.beerTypes.findFirst({ where: eq(beerTypes.id, a.beer.id) });
    expect(beer!.currentStock).toBe(99);
  });

  it('forbids a non-admin (member role)', async () => {
    const a = await seedClub('A');
    const con = await addConsumption(a);
    ctxRef.current = {
      user: { id: a.target.userId },
      member: { id: a.target.id, role: 'member' },
      club: { id: a.club.id },
    };

    const result = await hardDeleteConsumptionAction({ consumptionId: con.id });
    expect(result).toEqual({ ok: false, code: 'FORBIDDEN' });

    const remaining = await testDb.query.consumptions.findFirst({
      where: eq(consumptions.id, con.id),
    });
    expect(remaining).toBeDefined();
  });

  it('returns NOT_FOUND for a consumption in another club (club-scoped)', async () => {
    const a = await seedClub('A');
    const b = await seedClub('B');
    const conB = await addConsumption(b);
    asAdmin(a); // admin of A tries to delete B's row

    const result = await hardDeleteConsumptionAction({ consumptionId: conB.id });
    expect(result).toEqual({ ok: false, code: 'NOT_FOUND' });

    const remaining = await testDb.query.consumptions.findFirst({
      where: eq(consumptions.id, conB.id),
    });
    expect(remaining).toBeDefined();
  });
});

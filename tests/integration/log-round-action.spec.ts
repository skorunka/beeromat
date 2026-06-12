import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { makeTestDb, type TestDb } from '../helpers/db';

// Spec 033 — logRoundAction: one transaction, one beer per drinker on
// that drinker's OWN tab, partial-skip on out-of-stock.

let testDb: TestDb;
vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

const ctxRef = {
  current: null as null | {
    user: { id: string };
    member: { id: string };
    club: { id: string };
  },
};
vi.mock('@/lib/auth/session', () => ({
  requireUnlocked: async () => ctxRef.current!,
  requireMember: async () => ctxRef.current!,
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
// Balance read is post-commit and not the focus here.
vi.mock('@/lib/balance/calculate', () => ({ memberBalance: async () => 0n }));

import { logRoundAction } from '@/app/[locale]/(app)/log/actions';
import { users } from '@/lib/db/schema/auth';
import { clubs } from '@/lib/db/schema/clubs';
import { members } from '@/lib/db/schema/members';
import { beerTypes, stockChanges } from '@/lib/db/schema/catalog';
import { consumptions } from '@/lib/db/schema/consumption';

type Seed = Awaited<ReturnType<typeof seed>>;

async function mkMember(clubId: string, name: string, active = true) {
  const [u] = await testDb
    .insert(users)
    .values({ email: `${name}-${Math.random()}@x.test`, name, emailVerified: true })
    .returning();
  const [m] = await testDb
    .insert(members)
    .values({
      clubId,
      userId: u!.id,
      email: u!.email,
      displayName: name,
      role: 'member',
      isActive: active,
      acceptedInvitationAt: new Date(),
    })
    .returning();
  return { userId: u!.id, memberId: m!.id };
}

async function mkBeer(
  clubId: string,
  name: string,
  stock: number,
  priceMinor: bigint,
  createdByUserId: string,
) {
  const [b] = await testDb
    .insert(beerTypes)
    .values({ clubId, name, unitPriceMinor: priceMinor, currentStock: stock, createdByUserId })
    .returning();
  return b!.id;
}

async function seed() {
  const [club] = await testDb
    .insert(clubs)
    .values({ name: 'TK', currencyCode: 'CZK', defaultLocale: 'cs' })
    .returning();
  const self = await mkMember(club!.id, 'Franta');
  const pepa = await mkMember(club!.id, 'Pepa');
  const honza = await mkMember(club!.id, 'Honza');
  const lager = await mkBeer(club!.id, 'Svijany', 10, 40n, self.userId);
  const ipa = await mkBeer(club!.id, 'IPA', 0, 55n, self.userId); // out of stock
  ctxRef.current = {
    user: { id: self.userId },
    member: { id: self.memberId },
    club: { id: club!.id },
  };
  return { clubId: club!.id, self, pepa, honza, lager, ipa };
}

const consRows = (clubId: string) =>
  testDb.select().from(consumptions).where(eq(consumptions.clubId, clubId));
const stockRow = (beerId: string) =>
  testDb.select().from(beerTypes).where(eq(beerTypes.id, beerId)).then((r) => r[0]!);

describe('logRoundAction (spec 033)', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
    ctxRef.current = null;
  });

  it('logs one beer per drinker (incl. self) on each drinker’s own tab, stock −N', async () => {
    const s: Seed = await seed();
    const res = await logRoundAction({
      items: [
        { memberId: s.self.memberId, beerTypeId: s.lager },
        { memberId: s.pepa.memberId, beerTypeId: s.lager },
        { memberId: s.honza.memberId, beerTypeId: s.lager },
      ],
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.logged).toHaveLength(3);
    expect(res.skipped).toHaveLength(0);

    const rows = await consRows(s.clubId);
    expect(rows).toHaveLength(3);
    // One row per distinct drinker, each on their OWN tab, price snapshot 40.
    const byMember = new Map(rows.map((r) => [r.memberId, r]));
    for (const m of [s.self.memberId, s.pepa.memberId, s.honza.memberId]) {
      expect(byMember.get(m)).toBeTruthy();
      expect(byMember.get(m)!.unitPriceMinorSnapshot).toBe(40n);
      // Always attributed to the actor (the fetcher).
      expect(byMember.get(m)!.createdByUserId).toBe(s.self.userId);
    }
    // Self beer: member's user == creator → emergently NO "logged for you"
    // review. Teammates: creator != their user → a review each.
    expect(byMember.get(s.self.memberId)!.createdByUserId).toBe(s.self.userId);
    expect(byMember.get(s.pepa.memberId)!.createdByUserId).not.toBe(s.pepa.userId);
    expect(byMember.get(s.honza.memberId)!.createdByUserId).not.toBe(s.honza.userId);

    expect((await stockRow(s.lager)).currentStock).toBe(7);

    // All beers in the round share ONE round_id (drives the "Runda" badge).
    const roundIds = new Set(rows.map((r) => r.roundId));
    expect(roundIds.size).toBe(1);
    expect([...roundIds][0]).toBeTruthy();
  });

  it('partial success: one beer out of stock → rest logged, skipped reported', async () => {
    const s: Seed = await seed();
    const res = await logRoundAction({
      items: [
        { memberId: s.self.memberId, beerTypeId: s.lager },
        { memberId: s.pepa.memberId, beerTypeId: s.ipa }, // 0 stock
      ],
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.logged).toHaveLength(1);
    expect(res.logged[0]!.memberId).toBe(s.self.memberId);
    expect(res.skipped).toEqual([
      { memberId: s.pepa.memberId, beerTypeId: s.ipa, reason: 'OUT_OF_STOCK' },
    ]);
    expect(await consRows(s.clubId)).toHaveLength(1);
    expect((await stockRow(s.lager)).currentStock).toBe(9);
    expect((await stockRow(s.ipa)).currentStock).toBe(0);
  });

  it('all out of stock → ALL_SKIPPED, nothing written (no consumptions, no stock audit)', async () => {
    const s: Seed = await seed();
    // Drain the lager too.
    await testDb.update(beerTypes).set({ currentStock: 0 }).where(eq(beerTypes.id, s.lager));

    const res = await logRoundAction({
      items: [
        { memberId: s.self.memberId, beerTypeId: s.lager },
        { memberId: s.pepa.memberId, beerTypeId: s.ipa },
      ],
    });

    expect(res).toEqual({ ok: false, code: 'ALL_SKIPPED' });
    expect(await consRows(s.clubId)).toHaveLength(0);
    const audit = await testDb
      .select()
      .from(stockChanges)
      .where(eq(stockChanges.clubId, s.clubId));
    expect(audit).toHaveLength(0);
  });

  it('a member outside the club / inactive is skipped TARGET_NOT_IN_CLUB; rest log', async () => {
    const s: Seed = await seed();
    const other = await mkMember(s.clubId, 'Inactive', false); // inactive member
    const res = await logRoundAction({
      items: [
        { memberId: s.self.memberId, beerTypeId: s.lager },
        { memberId: other.memberId, beerTypeId: s.lager },
      ],
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.logged).toHaveLength(1);
    expect(res.skipped).toEqual([
      { memberId: other.memberId, beerTypeId: s.lager, reason: 'TARGET_NOT_IN_CLUB' },
    ]);
  });

  it('logs each drinker’s own beer in a mixed-beer round (override case)', async () => {
    const s: Seed = await seed();
    const pils = await mkBeer(s.clubId, 'Pilsner', 5, 45n, s.self.userId);
    const res = await logRoundAction({
      items: [
        { memberId: s.self.memberId, beerTypeId: s.lager },
        { memberId: s.pepa.memberId, beerTypeId: pils },
      ],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const rows = await consRows(s.clubId);
    const byMember = new Map(rows.map((r) => [r.memberId, r]));
    expect(byMember.get(s.self.memberId)!.beerTypeId).toBe(s.lager);
    expect(byMember.get(s.self.memberId)!.unitPriceMinorSnapshot).toBe(40n);
    expect(byMember.get(s.pepa.memberId)!.beerTypeId).toBe(pils);
    expect(byMember.get(s.pepa.memberId)!.unitPriceMinorSnapshot).toBe(45n);
  });
});

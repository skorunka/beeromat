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
    club: { id: string; consumptionUndoWindowSeconds: number };
  },
};

vi.mock('@/lib/auth/session', () => ({
  requireUnlocked: async () => ctxRef.current!,
  requireMember: async () => ctxRef.current!,
}));

vi.mock('next/cache', () => ({
  revalidatePath: () => {},
}));

import { logBeerAction, voidConsumptionAction } from '@/app/[locale]/(app)/log/actions';

async function seed(opts: { stock?: number; archived?: boolean } = {}) {
  const { users } = await import('@/lib/db/schema/auth');
  const { clubs } = await import('@/lib/db/schema/clubs');
  const { members } = await import('@/lib/db/schema/members');
  const { beerTypes } = await import('@/lib/db/schema/catalog');

  const [user] = await testDb
    .insert(users)
    .values({ email: `u-${Date.now()}-${Math.random()}@example.test`, name: 'U' })
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
      displayName: 'U',
      role: 'member',
    })
    .returning();
  if (!member) throw new Error('seed member');
  const [beer] = await testDb
    .insert(beerTypes)
    .values({
      clubId: club.id,
      name: 'Pilsner',
      unitPriceMinor: 5000n,
      currentStock: opts.stock ?? 10,
      isArchived: opts.archived ?? false,
      createdByUserId: user.id,
    })
    .returning();
  if (!beer) throw new Error('seed beer');
  return { user, club, member, beer };
}

describe('logBeerAction', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
    ctxRef.current = null;
  });

  it('happy path — inserts consumption, decrements stock, auto-opens session, returns balance', async () => {
    const { user, club, member, beer } = await seed({ stock: 5 });
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'member' },
      club: { id: club.id, consumptionUndoWindowSeconds: 60 },
    };

    const result = await logBeerAction({ beerTypeId: beer.id });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.consumptionId).toBeTruthy();
    expect(result.sessionId).toBeTruthy();
    // Single beer logged at 50.00 → balance is 5000 minor.
    expect(result.balanceAfterMinor).toBe(5000n);

    // Stock decremented.
    const { beerTypes } = await import('@/lib/db/schema/catalog');
    const { eq } = await import('drizzle-orm');
    const fresh = await testDb.query.beerTypes.findFirst({ where: eq(beerTypes.id, beer.id) });
    expect(fresh?.currentStock).toBe(4);
  });

  it('OUT_OF_STOCK — refuses to log when stock is 0', async () => {
    const { user, club, member, beer } = await seed({ stock: 0 });
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'member' },
      club: { id: club.id, consumptionUndoWindowSeconds: 60 },
    };
    const result = await logBeerAction({ beerTypeId: beer.id });
    expect(result).toEqual({ ok: false, code: 'OUT_OF_STOCK' });
  });

  it('BEER_NOT_AVAILABLE — archived beer is rejected', async () => {
    const { user, club, member, beer } = await seed({ archived: true });
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'member' },
      club: { id: club.id, consumptionUndoWindowSeconds: 60 },
    };
    const result = await logBeerAction({ beerTypeId: beer.id });
    expect(result).toEqual({ ok: false, code: 'BEER_NOT_AVAILABLE' });
  });

  it('BEER_NOT_AVAILABLE — cross-club beer is rejected (constitution principle II)', async () => {
    // Club A's member trying to log Club B's beer must be rejected
    // even though both ids are valid in their own clubs.
    const a = await seed();
    const b = await seed();
    ctxRef.current = {
      user: { id: a.user.id },
      member: { id: a.member.id, role: 'member' },
      club: { id: a.club.id, consumptionUndoWindowSeconds: 60 },
    };
    const result = await logBeerAction({ beerTypeId: b.beer.id });
    expect(result).toEqual({ ok: false, code: 'BEER_NOT_AVAILABLE' });

    // And Club B's stock is NOT touched.
    const { beerTypes } = await import('@/lib/db/schema/catalog');
    const { eq } = await import('drizzle-orm');
    const fresh = await testDb.query.beerTypes.findFirst({ where: eq(beerTypes.id, b.beer.id) });
    expect(fresh?.currentStock).toBe(10);
  });

  it('reuses the open session if one already exists', async () => {
    const { user, club, member, beer } = await seed();
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'member' },
      club: { id: club.id, consumptionUndoWindowSeconds: 60 },
    };
    const first = await logBeerAction({ beerTypeId: beer.id });
    const second = await logBeerAction({ beerTypeId: beer.id });
    expect(first.ok && second.ok && first.sessionId === second.sessionId).toBe(true);
  });

  it('balance accumulates across multiple logs', async () => {
    const { user, club, member, beer } = await seed();
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'member' },
      club: { id: club.id, consumptionUndoWindowSeconds: 60 },
    };
    await logBeerAction({ beerTypeId: beer.id });
    await logBeerAction({ beerTypeId: beer.id });
    const third = await logBeerAction({ beerTypeId: beer.id });
    expect(third.ok).toBe(true);
    if (!third.ok) return;
    // 3 × 50.00 = 150.00 → 15000 minor.
    expect(third.balanceAfterMinor).toBe(15000n);
  });

  it('voidConsumptionAction within window — restores stock, zeroes balance', async () => {
    const { user, club, member, beer } = await seed({ stock: 5 });
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'member' },
      club: { id: club.id, consumptionUndoWindowSeconds: 60 },
    };
    const logged = await logBeerAction({ beerTypeId: beer.id });
    expect(logged.ok).toBe(true);
    if (!logged.ok) return;

    const undone = await voidConsumptionAction({ consumptionId: logged.consumptionId });
    expect(undone.ok).toBe(true);
    if (!undone.ok) return;
    expect(undone.balanceAfterMinor).toBe(0n);

    // Stock restored.
    const { beerTypes } = await import('@/lib/db/schema/catalog');
    const { eq } = await import('drizzle-orm');
    const fresh = await testDb.query.beerTypes.findFirst({ where: eq(beerTypes.id, beer.id) });
    expect(fresh?.currentStock).toBe(5);
  });

  it('voidConsumptionAction ALREADY_VOIDED — second void on same consumption is rejected', async () => {
    const { user, club, member, beer } = await seed();
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'member' },
      club: { id: club.id, consumptionUndoWindowSeconds: 60 },
    };
    const logged = await logBeerAction({ beerTypeId: beer.id });
    if (!logged.ok) throw new Error('seed log');

    await voidConsumptionAction({ consumptionId: logged.consumptionId });
    const second = await voidConsumptionAction({ consumptionId: logged.consumptionId });
    expect(second).toEqual({ ok: false, code: 'ALREADY_VOIDED' });
  });

  it('voidConsumptionAction FORBIDDEN — logger past the undo window without override role', async () => {
    const { user, club, member, beer } = await seed();
    // Undo window is 0 seconds, so any consumption is immediately out of window.
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'member' },
      club: { id: club.id, consumptionUndoWindowSeconds: 0 },
    };
    const logged = await logBeerAction({ beerTypeId: beer.id });
    if (!logged.ok) throw new Error('seed log');

    const result = await voidConsumptionAction({ consumptionId: logged.consumptionId });
    expect(result).toEqual({ ok: false, code: 'FORBIDDEN' });
  });

  it('voidConsumptionAction override — stock_manager can void past the window', async () => {
    const { user, club, member, beer } = await seed();
    // Window 0 → not the logger's-undo path; relies on the role override.
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'stock_manager' },
      club: { id: club.id, consumptionUndoWindowSeconds: 0 },
    };
    const logged = await logBeerAction({ beerTypeId: beer.id });
    if (!logged.ok) throw new Error('seed log');

    const result = await voidConsumptionAction({ consumptionId: logged.consumptionId });
    expect(result.ok).toBe(true);
  });

  it('voidConsumptionAction NOT_FOUND — bogus consumption id', async () => {
    const { user, club, member } = await seed();
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'member' },
      club: { id: club.id, consumptionUndoWindowSeconds: 60 },
    };
    const result = await voidConsumptionAction({
      consumptionId: '00000000-0000-0000-0000-000000000000',
    });
    expect(result).toEqual({ ok: false, code: 'NOT_FOUND' });
  });
});

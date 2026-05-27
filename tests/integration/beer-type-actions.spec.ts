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
  requireUnlocked: async () => ctxRef.current!,
}));

vi.mock('next/cache', () => ({
  revalidatePath: () => {},
}));

import {
  createBeerTypeAction,
  archiveBeerTypeAction,
  unarchiveBeerTypeAction,
  recordRestockAction,
  recordStockAdjustmentAction,
} from '@/app/[locale]/(app)/admin/beer-types/actions';

async function seedClub(label = 'Test') {
  const { users } = await import('@/lib/db/schema/auth');
  const { clubs } = await import('@/lib/db/schema/clubs');
  const { members } = await import('@/lib/db/schema/members');

  const [user] = await testDb
    .insert(users)
    .values({ email: `sm-${Date.now()}-${Math.random()}@example.test`, name: 'SM' })
    .returning();
  if (!user) throw new Error('seed user');

  const [club] = await testDb
    .insert(clubs)
    .values({ name: label, currencyCode: 'CZK', defaultLocale: 'cs-CZ' })
    .returning();
  if (!club) throw new Error('seed club');

  const [member] = await testDb
    .insert(members)
    .values({
      clubId: club.id,
      userId: user.id,
      email: user.email,
      displayName: 'SM',
      role: 'stock_manager',
    })
    .returning();
  if (!member) throw new Error('seed member');

  return { user, club, member };
}

function setStockMgrCtx(seed: Awaited<ReturnType<typeof seedClub>>) {
  ctxRef.current = {
    user: { id: seed.user.id },
    member: { id: seed.member.id, role: 'stock_manager' },
    club: { id: seed.club.id },
  };
}

async function readBeer(id: string) {
  const { eq } = await import('drizzle-orm');
  const { beerTypes } = await import('@/lib/db/schema/catalog');
  return testDb.query.beerTypes.findFirst({ where: eq(beerTypes.id, id) });
}

async function readStockChanges(beerTypeId: string) {
  const { eq } = await import('drizzle-orm');
  const { stockChanges } = await import('@/lib/db/schema/catalog');
  return testDb.query.stockChanges.findMany({
    where: eq(stockChanges.beerTypeId, beerTypeId),
  });
}

describe('createBeerTypeAction', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
    ctxRef.current = null;
  });

  it('happy path — creates the beer, writes initial-stock audit row, assigns displayOrder', async () => {
    const seed = await seedClub();
    setStockMgrCtx(seed);

    const result = await createBeerTypeAction({
      name: 'Pilsner',
      unitPriceMinor: '5000',
      initialStock: 10,
      lowStockThreshold: 2,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const beer = await readBeer(result.beerTypeId);
    expect(beer?.name).toBe('Pilsner');
    expect(beer?.unitPriceMinor).toBe(5000n);
    expect(beer?.currentStock).toBe(10);
    expect(beer?.lowStockThreshold).toBe(2);
    expect(beer?.isArchived).toBe(false);
    expect(beer?.displayOrder).toBe(10); // first beer in empty club → 0 + 10

    const audit = await readStockChanges(result.beerTypeId);
    expect(audit).toHaveLength(1);
    expect(audit[0]?.delta).toBe(10);
    expect(audit[0]?.kind).toBe('restock');
    expect(audit[0]?.reason).toBe('initial stock');
  });

  it('initialStock = 0 — no stockChanges audit row written', async () => {
    const seed = await seedClub();
    setStockMgrCtx(seed);

    const result = await createBeerTypeAction({
      name: 'OutOfStockOnArrival',
      unitPriceMinor: '5000',
      initialStock: 0,
      lowStockThreshold: 2,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const audit = await readStockChanges(result.beerTypeId);
    expect(audit).toHaveLength(0);
  });

  it('auto-increments displayOrder when not provided (max + 10)', async () => {
    const seed = await seedClub();
    setStockMgrCtx(seed);

    const r1 = await createBeerTypeAction({
      name: 'A',
      unitPriceMinor: '5000',
      initialStock: 0,
      lowStockThreshold: 2,
    });
    const r2 = await createBeerTypeAction({
      name: 'B',
      unitPriceMinor: '5000',
      initialStock: 0,
      lowStockThreshold: 2,
    });
    if (!r1.ok || !r2.ok) throw new Error('seed beers');
    const a = await readBeer(r1.beerTypeId);
    const b = await readBeer(r2.beerTypeId);
    expect(a?.displayOrder).toBe(10);
    expect(b?.displayOrder).toBe(20);
  });

  it('DUPLICATE_NAME — case-insensitive collision within the same club', async () => {
    const seed = await seedClub();
    setStockMgrCtx(seed);

    await createBeerTypeAction({
      name: 'Pilsner',
      unitPriceMinor: '5000',
      initialStock: 0,
      lowStockThreshold: 2,
    });
    const dup = await createBeerTypeAction({
      name: 'PILSNER', // different case
      unitPriceMinor: '6000',
      initialStock: 0,
      lowStockThreshold: 2,
    });
    expect(dup).toEqual({ ok: false, code: 'DUPLICATE_NAME' });
  });

  it('cross-club: same name in different clubs is allowed', async () => {
    const a = await seedClub('A');
    const b = await seedClub('B');
    setStockMgrCtx(a);
    await createBeerTypeAction({
      name: 'Pilsner',
      unitPriceMinor: '5000',
      initialStock: 0,
      lowStockThreshold: 2,
    });
    setStockMgrCtx(b);
    const result = await createBeerTypeAction({
      name: 'Pilsner', // same name, different club
      unitPriceMinor: '5500',
      initialStock: 0,
      lowStockThreshold: 2,
    });
    expect(result.ok).toBe(true);
  });

  it('INVALID_INPUT on zero unit price', async () => {
    const seed = await seedClub();
    setStockMgrCtx(seed);
    const result = await createBeerTypeAction({
      name: 'Free',
      unitPriceMinor: '0',
      initialStock: 0,
      lowStockThreshold: 2,
    });
    expect(result).toEqual({ ok: false, code: 'INVALID_INPUT' });
  });

  it('BUY_ABOVE_SELL when buy price exceeds sell price', async () => {
    const seed = await seedClub();
    setStockMgrCtx(seed);
    const result = await createBeerTypeAction({
      name: 'LossLeader',
      unitPriceMinor: '5000',
      buyPriceMinor: '6000', // more than the sell price
      initialStock: 0,
      lowStockThreshold: 2,
    });
    expect(result).toEqual({ ok: false, code: 'BUY_ABOVE_SELL' });
  });
});

describe('archive/unarchive', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
    ctxRef.current = null;
  });

  it('archives + unarchives a beer', async () => {
    const seed = await seedClub();
    setStockMgrCtx(seed);
    const r = await createBeerTypeAction({
      name: 'X',
      unitPriceMinor: '5000',
      initialStock: 0,
      lowStockThreshold: 2,
    });
    if (!r.ok) throw new Error('seed beer');

    expect(await archiveBeerTypeAction(r.beerTypeId)).toEqual({ ok: true });
    expect((await readBeer(r.beerTypeId))?.isArchived).toBe(true);

    expect(await unarchiveBeerTypeAction(r.beerTypeId)).toEqual({ ok: true });
    expect((await readBeer(r.beerTypeId))?.isArchived).toBe(false);
  });

  it('NOT_FOUND on a non-uuid id', async () => {
    const seed = await seedClub();
    setStockMgrCtx(seed);
    expect(await archiveBeerTypeAction('not-a-uuid')).toEqual({
      ok: false,
      code: 'NOT_FOUND',
    });
  });

  it('cross-club archive returns NOT_FOUND', async () => {
    const a = await seedClub('A');
    const b = await seedClub('B');
    setStockMgrCtx(b);
    const bBeer = await createBeerTypeAction({
      name: 'BBeer',
      unitPriceMinor: '5000',
      initialStock: 0,
      lowStockThreshold: 2,
    });
    if (!bBeer.ok) throw new Error('seed b beer');

    setStockMgrCtx(a);
    const result = await archiveBeerTypeAction(bBeer.beerTypeId);
    expect(result).toEqual({ ok: false, code: 'NOT_FOUND' });
  });
});

describe('recordRestockAction', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
    ctxRef.current = null;
  });

  it('adds stock + writes audit row', async () => {
    const seed = await seedClub();
    setStockMgrCtx(seed);
    const r = await createBeerTypeAction({
      name: 'X',
      unitPriceMinor: '5000',
      initialStock: 5,
      lowStockThreshold: 2,
    });
    if (!r.ok) throw new Error('seed beer');

    const result = await recordRestockAction({
      beerTypeId: r.beerTypeId,
      quantity: 20,
      reason: 'monthly buy',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.newStock).toBe(25);

    const audit = await readStockChanges(r.beerTypeId);
    expect(audit).toHaveLength(2); // initial + this restock
    const latest = audit.find((a) => a.reason === 'monthly buy');
    expect(latest?.delta).toBe(20);
    expect(latest?.kind).toBe('restock');
  });

  it('rejects restocking an archived beer with ARCHIVED', async () => {
    const seed = await seedClub();
    setStockMgrCtx(seed);
    const r = await createBeerTypeAction({
      name: 'X',
      unitPriceMinor: '5000',
      initialStock: 0,
      lowStockThreshold: 2,
    });
    if (!r.ok) throw new Error('seed beer');
    await archiveBeerTypeAction(r.beerTypeId);

    const result = await recordRestockAction({
      beerTypeId: r.beerTypeId,
      quantity: 5,
    });
    expect(result).toEqual({ ok: false, code: 'ARCHIVED' });
  });
});

describe('recordStockAdjustmentAction', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
    ctxRef.current = null;
  });

  it('decreases stock (audit + write happen atomically)', async () => {
    const seed = await seedClub();
    setStockMgrCtx(seed);
    const r = await createBeerTypeAction({
      name: 'X',
      unitPriceMinor: '5000',
      initialStock: 10,
      lowStockThreshold: 2,
    });
    if (!r.ok) throw new Error('seed beer');

    const result = await recordStockAdjustmentAction({
      beerTypeId: r.beerTypeId,
      delta: -3,
      reason: 'spillage',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.newStock).toBe(7);
  });

  it('rejects an adjustment that would go negative', async () => {
    const seed = await seedClub();
    setStockMgrCtx(seed);
    const r = await createBeerTypeAction({
      name: 'X',
      unitPriceMinor: '5000',
      initialStock: 5,
      lowStockThreshold: 2,
    });
    if (!r.ok) throw new Error('seed beer');

    const result = await recordStockAdjustmentAction({
      beerTypeId: r.beerTypeId,
      delta: -10, // 5 - 10 = -5, would go negative
      reason: 'overdrain',
    });
    expect(result).toEqual({ ok: false, code: 'WOULD_GO_NEGATIVE' });
    // Stock unchanged.
    expect((await readBeer(r.beerTypeId))?.currentStock).toBe(5);
  });

  it('rejects a zero delta with INVALID_INPUT', async () => {
    const seed = await seedClub();
    setStockMgrCtx(seed);
    const r = await createBeerTypeAction({
      name: 'X',
      unitPriceMinor: '5000',
      initialStock: 5,
      lowStockThreshold: 2,
    });
    if (!r.ok) throw new Error('seed beer');

    const result = await recordStockAdjustmentAction({
      beerTypeId: r.beerTypeId,
      delta: 0,
      reason: 'noop',
    });
    expect(result).toEqual({ ok: false, code: 'INVALID_INPUT' });
  });
});

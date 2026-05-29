import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { makeTestDb, type TestDb } from '../helpers/db';

let testDb: TestDb;

vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

import { createAgreementTx, recordResultTx } from '@/lib/db/queries/match-agreements';
import { users } from '@/lib/db/schema/auth';
import { beerTypes } from '@/lib/db/schema/catalog';
import { clubs } from '@/lib/db/schema/clubs';
import { members } from '@/lib/db/schema/members';

// A for-beer match where the loser owes MORE beers than the chosen
// beer's stock must NOT drive stock negative. The result type
// (transferredCount vs requestedCount) + the recordedPartial UI copy
// already expect best-effort partial settlement.

async function seed(opts: { stock: number; loserBeerCount: number }) {
  const [club] = await testDb
    .insert(clubs)
    .values({
      name: 'TC',
      currencyCode: 'CZK',
      defaultLocale: 'cs',
      matchLoserBeerCount: opts.loserBeerCount,
    })
    .returning();
  async function user(name: string) {
    const [u] = await testDb
      .insert(users)
      .values({ email: `${name}@x.test`, name, emailVerified: true })
      .returning();
    return u!;
  }
  async function member(name: string, u: { id: string }) {
    const [m] = await testDb
      .insert(members)
      .values({
        clubId: club!.id,
        userId: u.id,
        email: `${name}@x.test`,
        displayName: name,
        role: 'member',
        acceptedInvitationAt: new Date(),
      })
      .returning();
    return m!;
  }
  const uU = await user('U');
  const uA = await user('Alice');
  const uB = await user('Bob');
  const mA = await member('Alice', uA);
  const mB = await member('Bob', uB);
  const [beer] = await testDb
    .insert(beerTypes)
    .values({
      clubId: club!.id,
      name: 'Pilsner',
      unitPriceMinor: 5000n,
      currentStock: opts.stock,
      createdByUserId: uU.id,
    })
    .returning();
  return { club: club!, uU, mA, mB, beer: beer! };
}

describe('match settlement with insufficient stock', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
  });

  it('transfers only what stock allows and never drives stock negative', async () => {
    // Loser owes 2 beers; only 1 Pilsner in stock.
    const { club, uU, mA, mB, beer } = await seed({ stock: 1, loserBeerCount: 2 });

    const created = await createAgreementTx({
      clubId: club.id,
      createdByUserId: uU.id,
      input: {
        format: 'singles',
        forBeer: true,
        sides: { A: { seat1: mA.id }, B: { seat1: mB.id } },
      },
    });
    if (!created.ok) throw new Error('create');

    const r = await recordResultTx({
      agreementId: created.agreementId,
      clubId: club.id,
      recordedByUserId: uU.id,
      winningSide: 'A',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('record');

    // Best-effort: 1 transferred of 2 requested.
    expect(r.requestedCount).toBe(2);
    expect(r.transferredCount).toBe(1);

    // Stock must bottom out at 0 — NEVER negative.
    const fresh = await testDb.query.beerTypes.findFirst({ where: eq(beerTypes.id, beer.id) });
    expect(fresh!.currentStock).toBe(0);
    expect(fresh!.currentStock).toBeGreaterThanOrEqual(0);
  });

  it('full settlement when stock is sufficient (regression guard)', async () => {
    const { club, uU, mA, mB, beer } = await seed({ stock: 5, loserBeerCount: 2 });
    const created = await createAgreementTx({
      clubId: club.id,
      createdByUserId: uU.id,
      input: {
        format: 'singles',
        forBeer: true,
        sides: { A: { seat1: mA.id }, B: { seat1: mB.id } },
      },
    });
    if (!created.ok) throw new Error('create');
    const r = await recordResultTx({
      agreementId: created.agreementId,
      clubId: club.id,
      recordedByUserId: uU.id,
      winningSide: 'A',
    });
    if (!r.ok) throw new Error('record');
    expect(r.transferredCount).toBe(2);
    expect(r.requestedCount).toBe(2);
    const fresh = await testDb.query.beerTypes.findFirst({ where: eq(beerTypes.id, beer.id) });
    expect(fresh!.currentStock).toBe(3);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { makeTestDb, type TestDb } from '../helpers/db';

let testDb: TestDb;

vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

import {
  createAgreementTx,
  recordResultTx,
  reverseResultTx,
} from '@/lib/db/queries/match-agreements';
import { users } from '@/lib/db/schema/auth';
import { betTransferVoids, betTransfers } from '@/lib/db/schema/bets';
import { beerTypes } from '@/lib/db/schema/catalog';
import { clubs } from '@/lib/db/schema/clubs';
import { consumptionVoids, consumptions } from '@/lib/db/schema/consumption';
import { matchBetTransfers, matches } from '@/lib/db/schema/matches';
import { members } from '@/lib/db/schema/members';
import { drinkSessions } from '@/lib/db/schema/sessions';
import { memberBalance } from '@/lib/balance/calculate';

// Spec 018 T008 — integration test for the rewritten match-settle
// transaction. Covers the 9 cases declared in plan.md §"Test layer
// declaration".

async function seedClubWithMembers(opts: { matchLoserBeerCount?: number } = {}) {
  const [club] = await testDb
    .insert(clubs)
    .values({
      name: 'TC Test',
      currencyCode: 'CZK',
      defaultLocale: 'cs',
      matchLoserBeerCount: opts.matchLoserBeerCount ?? 1,
    })
    .returning();
  if (!club) throw new Error('seed club');

  async function insertUser(name: string) {
    const [u] = await testDb
      .insert(users)
      .values({ email: `${name.toLowerCase()}@x.test`, name, emailVerified: true })
      .returning();
    if (!u) throw new Error(`user ${name}`);
    return u;
  }
  async function insertMember(name: string, forUser: { id: string }) {
    const [m] = await testDb
      .insert(members)
      .values({
        clubId: club!.id,
        userId: forUser.id,
        email: `${name.toLowerCase()}@x.test`,
        displayName: name,
        role: 'member',
        acceptedInvitationAt: new Date(),
      })
      .returning();
    if (!m) throw new Error(`member ${name}`);
    return m;
  }

  const userU = await insertUser('U');
  const userA = await insertUser('Alice');
  const userB = await insertUser('Bob');
  const userC = await insertUser('Carol');
  const userD = await insertUser('Dave');
  const memberA = await insertMember('Alice', userA);
  const memberB = await insertMember('Bob', userB);
  const memberC = await insertMember('Carol', userC);
  const memberD = await insertMember('Dave', userD);

  return { club, userU, memberA, memberB, memberC, memberD };
}

async function seedBeer(
  clubId: string,
  userId: string,
  args: { name: string; priceMinor?: bigint; stock?: number; isArchived?: boolean } = { name: 'Pilsner' },
) {
  const [b] = await testDb
    .insert(beerTypes)
    .values({
      clubId,
      name: args.name,
      unitPriceMinor: args.priceMinor ?? 5000n,
      currentStock: args.stock ?? 100,
      isArchived: args.isArchived ?? false,
      createdByUserId: userId,
    })
    .returning();
  if (!b) throw new Error('seed beer');
  return b;
}

async function ensureOpenSession(clubId: string, userId: string) {
  const existing = await testDb
    .select()
    .from(drinkSessions)
    .where(eq(drinkSessions.clubId, clubId))
    .limit(1);
  if (existing[0]) return existing[0];
  const [s] = await testDb
    .insert(drinkSessions)
    .values({ clubId, openedByUserId: userId, startedAt: new Date() })
    .returning();
  if (!s) throw new Error('seed session');
  return s;
}

describe('spec 018 — match-settle with auto-create bet', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
  });

  it('case 1 — singles default beer (winner has a last-beer): creates 1 consumption + 1 transfer + 1 link', async () => {
    const { club, userU, memberA, memberB } = await seedClubWithMembers();
    const pilsner = await seedBeer(club.id, userU.id, { name: 'Pilsner' });
    const session = await ensureOpenSession(club.id, userU.id);
    // Pre-seed memberA's last beer = Pilsner via a regular consumption.
    await testDb.insert(consumptions).values({
      clubId: club.id,
      drinkSessionId: session.id,
      memberId: memberA.id,
      beerTypeId: pilsner.id,
      unitPriceMinorSnapshot: 5000n,
      createdByUserId: userU.id,
    });

    const created = await createAgreementTx({
      clubId: club.id,
      createdByUserId: userU.id,
      input: {
        format: 'singles',
        forBeer: true,
        sides: { A: { seat1: memberA.id }, B: { seat1: memberB.id } },
      },
    });
    if (!created.ok) throw new Error();
    const r = await recordResultTx({
      agreementId: created.agreementId,
      clubId: club.id,
      recordedByUserId: userU.id,
      winningSide: 'A',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error();
    expect(r.betBeerTypeId).toBe(pilsner.id);
    expect(r.transferredCount).toBe(1);

    // memberA (winner) has +1 consumption beyond the pre-seeded one.
    const aConsumptions = await testDb
      .select()
      .from(consumptions)
      .where(eq(consumptions.memberId, memberA.id));
    expect(aConsumptions).toHaveLength(2);

    // One bet_transfer A → B + one link.
    const transfers = await testDb.select().from(betTransfers);
    expect(transfers).toHaveLength(1);
    expect(transfers[0]?.fromMemberId).toBe(memberA.id);
    expect(transfers[0]?.toMemberId).toBe(memberB.id);
    expect(await testDb.select().from(matchBetTransfers)).toHaveLength(1);
  });

  it('case 2 — singles no last-beer: falls back to cheapest in-stock', async () => {
    const { club, userU, memberA, memberB } = await seedClubWithMembers();
    await seedBeer(club.id, userU.id, { name: 'Pilsner', priceMinor: 5000n });
    const kozel = await seedBeer(club.id, userU.id, { name: 'Kozel', priceMinor: 4000n });
    // No pre-seeded consumption → memberA has no last-beer.

    const created = await createAgreementTx({
      clubId: club.id,
      createdByUserId: userU.id,
      input: {
        format: 'singles',
        forBeer: true,
        sides: { A: { seat1: memberA.id }, B: { seat1: memberB.id } },
      },
    });
    if (!created.ok) throw new Error();
    const r = await recordResultTx({
      agreementId: created.agreementId,
      clubId: club.id,
      recordedByUserId: userU.id,
      winningSide: 'A',
    });
    if (!r.ok) throw new Error();
    expect(r.betBeerTypeId).toBe(kozel.id); // cheapest
  });

  it('case 3 — no in-stock beer: action fails with NO_BEER_IN_STOCK and rolls back', async () => {
    const { club, userU, memberA, memberB } = await seedClubWithMembers();
    // Beer exists but is out of stock.
    await seedBeer(club.id, userU.id, { name: 'Pilsner', stock: 0 });

    const created = await createAgreementTx({
      clubId: club.id,
      createdByUserId: userU.id,
      input: {
        format: 'singles',
        forBeer: true,
        sides: { A: { seat1: memberA.id }, B: { seat1: memberB.id } },
      },
    });
    if (!created.ok) throw new Error();
    const r = await recordResultTx({
      agreementId: created.agreementId,
      clubId: club.id,
      recordedByUserId: userU.id,
      winningSide: 'A',
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error();
    expect(r.code).toBe('NO_BEER_IN_STOCK');

    // Match wasn't recorded; agreement still OPEN.
    expect(await testDb.select().from(matches)).toHaveLength(0);
    expect(await testDb.select().from(betTransfers)).toHaveLength(0);
  });

  it('case 4 — doubles, matchLoserBeerCount=2: split [1, 1] = 2 transfers total', async () => {
    const { club, userU, memberA, memberB, memberC, memberD } = await seedClubWithMembers({
      matchLoserBeerCount: 2,
    });
    await seedBeer(club.id, userU.id, { name: 'Pilsner' });

    const created = await createAgreementTx({
      clubId: club.id,
      createdByUserId: userU.id,
      input: {
        format: 'doubles',
        forBeer: true,
        sides: {
          A: { seat1: memberA.id, seat2: memberB.id },
          B: { seat1: memberC.id, seat2: memberD.id },
        },
        pairingKind: 'straight',
      },
    });
    if (!created.ok) throw new Error();
    const r = await recordResultTx({
      agreementId: created.agreementId,
      clubId: club.id,
      recordedByUserId: userU.id,
      winningSide: 'B',
    });
    if (!r.ok) throw new Error();
    expect(r.transferredCount).toBe(2);
    // Straight pairing, B wins → C beats A, D beats B; each loses 1 beer.
    const transfers = await testDb.select().from(betTransfers);
    expect(transfers).toHaveLength(2);
    const toMembers = transfers.map((t) => t.toMemberId).sort();
    expect(toMembers).toEqual([memberA.id, memberB.id].sort());
  });

  it('case 5 — doubles, matchLoserBeerCount=3: split [2, 1] (seat1 pair gets extra)', async () => {
    const { club, userU, memberA, memberB, memberC, memberD } = await seedClubWithMembers({
      matchLoserBeerCount: 3,
    });
    await seedBeer(club.id, userU.id, { name: 'Pilsner' });

    const created = await createAgreementTx({
      clubId: club.id,
      createdByUserId: userU.id,
      input: {
        format: 'doubles',
        forBeer: true,
        sides: {
          A: { seat1: memberA.id, seat2: memberB.id },
          B: { seat1: memberC.id, seat2: memberD.id },
        },
        pairingKind: 'straight',
      },
    });
    if (!created.ok) throw new Error();
    const r = await recordResultTx({
      agreementId: created.agreementId,
      clubId: club.id,
      recordedByUserId: userU.id,
      winningSide: 'B',
    });
    if (!r.ok) throw new Error();
    expect(r.transferredCount).toBe(3);
    // Seat1 pair (A1↔B1) → C-vs-A → A is the loser of seat1 pair → A owes 2.
    const aTransfers = await testDb
      .select()
      .from(betTransfers)
      .where(eq(betTransfers.toMemberId, memberA.id));
    expect(aTransfers).toHaveLength(2);
    const bTransfers = await testDb
      .select()
      .from(betTransfers)
      .where(eq(betTransfers.toMemberId, memberB.id));
    expect(bTransfers).toHaveLength(1);
  });

  it('case 6 — override beer used instead of default', async () => {
    const { club, userU, memberA, memberB } = await seedClubWithMembers();
    const pilsner = await seedBeer(club.id, userU.id, { name: 'Pilsner' });
    const kozel = await seedBeer(club.id, userU.id, { name: 'Kozel', priceMinor: 4000n });
    const session = await ensureOpenSession(club.id, userU.id);
    // Pre-seed Pilsner as memberA's last beer.
    await testDb.insert(consumptions).values({
      clubId: club.id,
      drinkSessionId: session.id,
      memberId: memberA.id,
      beerTypeId: pilsner.id,
      unitPriceMinorSnapshot: 5000n,
      createdByUserId: userU.id,
    });

    const created = await createAgreementTx({
      clubId: club.id,
      createdByUserId: userU.id,
      input: {
        format: 'singles',
        forBeer: true,
        sides: { A: { seat1: memberA.id }, B: { seat1: memberB.id } },
      },
    });
    if (!created.ok) throw new Error();
    // Override to Kozel even though Pilsner is the last-beer default.
    const r = await recordResultTx({
      agreementId: created.agreementId,
      clubId: club.id,
      recordedByUserId: userU.id,
      winningSide: 'A',
      betBeerOverrideId: kozel.id,
    });
    if (!r.ok) throw new Error();
    expect(r.betBeerTypeId).toBe(kozel.id);

    // The new consumption is for Kozel (the override), not Pilsner.
    const transfers = await testDb.select().from(betTransfers);
    const newConsumption = await testDb
      .select()
      .from(consumptions)
      .where(eq(consumptions.id, transfers[0]!.sourceConsumptionId));
    expect(newConsumption[0]?.beerTypeId).toBe(kozel.id);
  });

  it('case 7 — no open session: auto-opens one', async () => {
    const { club, userU, memberA, memberB } = await seedClubWithMembers();
    await seedBeer(club.id, userU.id, { name: 'Pilsner' });
    // Explicitly NO session pre-seeded.

    const created = await createAgreementTx({
      clubId: club.id,
      createdByUserId: userU.id,
      input: {
        format: 'singles',
        forBeer: true,
        sides: { A: { seat1: memberA.id }, B: { seat1: memberB.id } },
      },
    });
    if (!created.ok) throw new Error();
    const r = await recordResultTx({
      agreementId: created.agreementId,
      clubId: club.id,
      recordedByUserId: userU.id,
      winningSide: 'A',
    });
    expect(r.ok).toBe(true);
    // A session now exists.
    const sessions = await testDb.select().from(drinkSessions);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.endedAt).toBeNull();
  });

  it('case 8 — match-void cascade: voids match + transfer + consumption; balance returns + stock restored', async () => {
    const { club, userU, memberA, memberB } = await seedClubWithMembers();
    const pilsner = await seedBeer(club.id, userU.id, { name: 'Pilsner', stock: 50 });

    const created = await createAgreementTx({
      clubId: club.id,
      createdByUserId: userU.id,
      input: {
        format: 'singles',
        forBeer: true,
        sides: { A: { seat1: memberA.id }, B: { seat1: memberB.id } },
      },
    });
    if (!created.ok) throw new Error();
    await recordResultTx({
      agreementId: created.agreementId,
      clubId: club.id,
      recordedByUserId: userU.id,
      winningSide: 'A',
    });

    // Pre-void state: B's balance includes the beer; stock dropped to 49.
    const balanceBeforeB = await memberBalance(memberB.id);
    expect(balanceBeforeB).toBe(5000n);
    const beerBefore = await testDb
      .select()
      .from(beerTypes)
      .where(eq(beerTypes.id, pilsner.id));
    expect(beerBefore[0]?.currentStock).toBe(49);

    // Reverse the match.
    const r = await reverseResultTx({
      agreementId: created.agreementId,
      clubId: club.id,
      reversedByUserId: userU.id,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error();

    // Match voided.
    expect((await testDb.select().from(matches))[0]?.voidedAt).not.toBeNull();
    // Transfer voided.
    expect(await testDb.select().from(betTransferVoids)).toHaveLength(1);
    // Consumption voided (spec 018 cascade).
    expect(await testDb.select().from(consumptionVoids)).toHaveLength(1);
    // B's balance returned.
    expect(await memberBalance(memberB.id)).toBe(0n);
    // Stock restored.
    const beerAfter = await testDb
      .select()
      .from(beerTypes)
      .where(eq(beerTypes.id, pilsner.id));
    expect(beerAfter[0]?.currentStock).toBe(50);
  });

  it('case 9 — FR-003 invariant: winner balance is unchanged by the bet (transfer offsets consumption)', async () => {
    const { club, userU, memberA, memberB } = await seedClubWithMembers();
    await seedBeer(club.id, userU.id, { name: 'Pilsner' });

    const created = await createAgreementTx({
      clubId: club.id,
      createdByUserId: userU.id,
      input: {
        format: 'singles',
        forBeer: true,
        sides: { A: { seat1: memberA.id }, B: { seat1: memberB.id } },
      },
    });
    if (!created.ok) throw new Error();
    await recordResultTx({
      agreementId: created.agreementId,
      clubId: club.id,
      recordedByUserId: userU.id,
      winningSide: 'A',
    });

    // Winner A: the auto-created consumption + the bet_transfer net to
    // zero on A's balance (cost moves to B). Verifies FR-003.
    expect(await memberBalance(memberA.id)).toBe(0n);
    // Loser B: bears the full cost.
    expect(await memberBalance(memberB.id)).toBe(5000n);
  });
});

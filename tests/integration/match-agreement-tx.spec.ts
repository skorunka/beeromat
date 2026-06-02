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
  cancelAgreementTx,
  createAgreementTx,
  editAgreementTx,
  recordResultTx,
  reverseResultTx,
} from '@/lib/db/queries/match-agreements';
import { users } from '@/lib/db/schema/auth';
import { betTransferVoids, betTransfers } from '@/lib/db/schema/bets';
import { beerTypes } from '@/lib/db/schema/catalog';
import { consumptions } from '@/lib/db/schema/consumption';
import {
  matchAgreementSides,
  matchAgreements,
  matchBetTransfers,
  matches,
} from '@/lib/db/schema/matches';
import { clubs } from '@/lib/db/schema/clubs';
import { members } from '@/lib/db/schema/members';
import { drinkSessions } from '@/lib/db/schema/sessions';

interface Scenario {
  club: { id: string };
  user: { id: string };
  memberA: { id: string };
  memberB: { id: string };
  memberC: { id: string };
  memberD: { id: string };
}

async function seedFourMembers(): Promise<Scenario> {
  const [club] = await testDb
    .insert(clubs)
    .values({ name: 'TC', currencyCode: 'CZK', defaultLocale: 'cs' })
    .returning();
  if (!club) throw new Error('club');

  const insertUser = async (name: string) => {
    const [u] = await testDb
      .insert(users)
      .values({ email: `${name.toLowerCase()}@x.test`, name, emailVerified: true })
      .returning();
    if (!u) throw new Error(`user ${name}`);
    return u;
  };
  const userU = await insertUser('U'); // the actor used for createdByUserId etc.
  const userA = await insertUser('Alice');
  const userB = await insertUser('Bob');
  const userC = await insertUser('Carol');
  const userD = await insertUser('Dave');

  const insertMember = async (
    name: string,
    forUser: { id: string },
  ): Promise<{ id: string }> => {
    const [member] = await testDb
      .insert(members)
      .values({
        clubId: club.id,
        userId: forUser.id,
        email: `${name.toLowerCase()}@x.test`,
        displayName: name,
        role: 'member',
        acceptedInvitationAt: new Date(),
      })
      .returning();
    if (!member) throw new Error(`member ${name}`);
    return member;
  };
  const memberA = await insertMember('Alice', userA);
  const memberB = await insertMember('Bob', userB);
  const memberC = await insertMember('Carol', userC);
  const memberD = await insertMember('Dave', userD);

  return { club, user: userU, memberA, memberB, memberC, memberD };
}

async function ensureOpenSessionAndBeer(
  clubId: string,
  userId: string,
): Promise<{ sessionId: string; beerTypeId: string }> {
  // Reuse the open session if one already exists for the club (the
  // schema enforces one open session per club via uniq_drink_sessions_club_open).
  const existingSession = await testDb
    .select({ id: drinkSessions.id })
    .from(drinkSessions)
    .where(eq(drinkSessions.clubId, clubId))
    .limit(1);
  let sessionId: string;
  if (existingSession.length > 0) {
    sessionId = existingSession[0]!.id;
  } else {
    const [session] = await testDb
      .insert(drinkSessions)
      .values({ clubId, openedByUserId: userId, startedAt: new Date() })
      .returning();
    if (!session) throw new Error('session');
    sessionId = session.id;
  }

  const existingBeer = await testDb
    .select({ id: beerTypes.id })
    .from(beerTypes)
    .where(eq(beerTypes.clubId, clubId))
    .limit(1);
  let beerTypeId: string;
  if (existingBeer.length > 0) {
    beerTypeId = existingBeer[0]!.id;
  } else {
    const [beer] = await testDb
      .insert(beerTypes)
      .values({
        clubId,
        name: 'Pilsner',
        unitPriceMinor: 5000n,
        currentStock: 100,
        createdByUserId: userId,
      })
      .returning();
    if (!beer) throw new Error('beer');
    beerTypeId = beer.id;
  }
  return { sessionId, beerTypeId };
}

async function seedBeerForMember(
  clubId: string,
  memberId: string,
  userId: string,
  count: number,
) {
  const { sessionId, beerTypeId } = await ensureOpenSessionAndBeer(clubId, userId);
  for (let i = 0; i < count; i += 1) {
    await testDb.insert(consumptions).values({
      clubId,
      drinkSessionId: sessionId,
      memberId,
      beerTypeId,
      createdByUserId: userId,
      unitPriceMinorSnapshot: 5000n,
    });
  }
}

describe('createAgreementTx — spec 013', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
  });

  it('inserts singles agreement + 2 sides rows', async () => {
    const { club, user, memberA, memberB } = await seedFourMembers();
    const r = await createAgreementTx({
      clubId: club.id,
      createdByUserId: user.id,
      input: {
        format: 'singles',
        forBeer: true,
        sides: { A: { seat1: memberA.id }, B: { seat1: memberB.id } },
      },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error();

    const agreements = await testDb.select().from(matchAgreements);
    expect(agreements).toHaveLength(1);
    expect(agreements[0]?.format).toBe('singles');
    expect(agreements[0]?.pairingKind).toBeNull();

    const sides = await testDb.select().from(matchAgreementSides);
    expect(sides).toHaveLength(2);
  });

  it('inserts doubles agreement + 4 sides rows', async () => {
    const { club, user, memberA, memberB, memberC, memberD } = await seedFourMembers();
    const r = await createAgreementTx({
      clubId: club.id,
      createdByUserId: user.id,
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
    expect(r.ok).toBe(true);

    const agreements = await testDb.select().from(matchAgreements);
    expect(agreements[0]?.format).toBe('doubles');
    expect(agreements[0]?.pairingKind).toBe('straight');
    const sides = await testDb.select().from(matchAgreementSides);
    expect(sides).toHaveLength(4);
  });

  it('rejects DUPLICATE_MEMBER', async () => {
    const { club, user, memberA, memberB, memberC } = await seedFourMembers();
    const r = await createAgreementTx({
      clubId: club.id,
      createdByUserId: user.id,
      input: {
        format: 'doubles',
        forBeer: true,
        sides: {
          A: { seat1: memberA.id, seat2: memberB.id },
          B: { seat1: memberC.id, seat2: memberA.id }, // A appears twice
        },
        pairingKind: 'straight',
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('DUPLICATE_MEMBER');
  });
});

describe('recordResultTx — spec 013', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
  });

  it('doubles for-beer = yes produces 2 matches rows + 2 paired transfers (straight)', async () => {
    const { club, user, memberA, memberB, memberC, memberD } = await seedFourMembers();
    // Spec 018 — matchLoserBeerCount is per-side; default 1 would
    // split [1, 0] across the two pairs. Bump to 2 so doubles
    // produces one transfer per pair (the original test's intent).
    await testDb
      .update(clubs)
      .set({ matchLoserBeerCount: 2 })
      .where(eq(clubs.id, club.id));
    // Open session + a non-archived beer for the winners. Spec 018
    // auto-creates the winner's consumption from the catalog, so
    // we no longer need to pre-seed winner drinks.
    await seedBeerForMember(club.id, memberC.id, user.id, 1);

    const created = await createAgreementTx({
      clubId: club.id,
      createdByUserId: user.id,
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
      recordedByUserId: user.id,
      winningSide: 'B',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error();
    expect(r.matchRowIds).toHaveLength(2);

    const matchRows = await testDb.select().from(matches);
    expect(matchRows).toHaveLength(2);
    // Pairing straight: A1↔B1, A2↔B2. Side B wins → C beats A, D beats B.
    const expectations = [
      { winner: memberC.id, loser: memberA.id },
      { winner: memberD.id, loser: memberB.id },
    ];
    for (const exp of expectations) {
      const found = matchRows.find(
        (m) => m.winnerMemberId === exp.winner && m.loserMemberId === exp.loser,
      );
      expect(found).toBeDefined();
      expect(found?.agreementId).toBe(created.agreementId);
    }

    const transfers = await testDb.select().from(betTransfers);
    expect(transfers).toHaveLength(2);
    const links = await testDb.select().from(matchBetTransfers);
    expect(links).toHaveLength(2);
  });

  it('doubles crossed pairing flips who-owes-whom', async () => {
    const { club, user, memberA, memberB, memberC, memberD } = await seedFourMembers();
    const created = await createAgreementTx({
      clubId: club.id,
      createdByUserId: user.id,
      input: {
        format: 'doubles',
        forBeer: false, // simplify — just verify pairing math
        sides: {
          A: { seat1: memberA.id, seat2: memberB.id },
          B: { seat1: memberC.id, seat2: memberD.id },
        },
        pairingKind: 'crossed',
      },
    });
    if (!created.ok) throw new Error();
    await recordResultTx({
      agreementId: created.agreementId,
      clubId: club.id,
      recordedByUserId: user.id,
      winningSide: 'B',
    });
    const matchRows = await testDb.select().from(matches);
    expect(matchRows).toHaveLength(2);
    // Crossed: A1↔B2, A2↔B1. Side B wins → D beats A (A1↔B2), C beats B (A2↔B1).
    const winners = matchRows.map((m) => m.winnerMemberId).sort();
    const losers = matchRows.map((m) => m.loserMemberId).sort();
    expect(winners).toEqual([memberC.id, memberD.id].sort());
    expect(losers).toEqual([memberA.id, memberB.id].sort());
    const dvsA = matchRows.find(
      (m) => m.winnerMemberId === memberD.id && m.loserMemberId === memberA.id,
    );
    expect(dvsA).toBeDefined();
    const cvsB = matchRows.find(
      (m) => m.winnerMemberId === memberC.id && m.loserMemberId === memberB.id,
    );
    expect(cvsB).toBeDefined();
  });

  it('singles for-beer = yes produces 1 match row + 1 transfer', async () => {
    const { club, user, memberA, memberB } = await seedFourMembers();
    await seedBeerForMember(club.id, memberA.id, user.id, 1);

    const created = await createAgreementTx({
      clubId: club.id,
      createdByUserId: user.id,
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
      recordedByUserId: user.id,
      winningSide: 'A',
    });
    expect(r.ok).toBe(true);
    const matchRows = await testDb.select().from(matches);
    expect(matchRows).toHaveLength(1);
    expect(matchRows[0]?.winnerMemberId).toBe(memberA.id);
    expect(matchRows[0]?.loserMemberId).toBe(memberB.id);
    const transfers = await testDb.select().from(betTransfers);
    expect(transfers).toHaveLength(1);
  });

  it('US3 — for_beer = no records result but produces zero transfers', async () => {
    const { club, user, memberA, memberB } = await seedFourMembers();
    await seedBeerForMember(club.id, memberA.id, user.id, 5); // plenty of eligible consumptions

    const created = await createAgreementTx({
      clubId: club.id,
      createdByUserId: user.id,
      input: {
        format: 'singles',
        forBeer: false,
        sides: { A: { seat1: memberA.id }, B: { seat1: memberB.id } },
      },
    });
    if (!created.ok) throw new Error();
    const r = await recordResultTx({
      agreementId: created.agreementId,
      clubId: club.id,
      recordedByUserId: user.id,
      winningSide: 'A',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error();
    expect(r.transferredCount).toBe(0);
    expect(r.requestedCount).toBe(0);

    const matchRows = await testDb.select().from(matches);
    expect(matchRows).toHaveLength(1); // result IS persisted
    const transfers = await testDb.select().from(betTransfers);
    expect(transfers).toHaveLength(0); // NO transfers
    const links = await testDb.select().from(matchBetTransfers);
    expect(links).toHaveLength(0);
  });

  it('rejects ALREADY_RECORDED on second attempt', async () => {
    const { club, user, memberA, memberB } = await seedFourMembers();
    const created = await createAgreementTx({
      clubId: club.id,
      createdByUserId: user.id,
      input: {
        format: 'singles',
        forBeer: false,
        sides: { A: { seat1: memberA.id }, B: { seat1: memberB.id } },
      },
    });
    if (!created.ok) throw new Error();
    await recordResultTx({
      agreementId: created.agreementId,
      clubId: club.id,
      recordedByUserId: user.id,
      winningSide: 'A',
    });
    const r2 = await recordResultTx({
      agreementId: created.agreementId,
      clubId: club.id,
      recordedByUserId: user.id,
      winningSide: 'B',
    });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.code).toBe('ALREADY_RECORDED');
  });
});

describe('reverseResultTx — spec 013', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
  });

  it('voids all linked matches + transfers + sets reversed_at + nulls result_recorded_at', async () => {
    const { club, user, memberA, memberB, memberC, memberD } = await seedFourMembers();
    // Spec 018 — bump matchLoserBeerCount to 2 so doubles still
    // produces one transfer per pair (test's original intent).
    await testDb
      .update(clubs)
      .set({ matchLoserBeerCount: 2 })
      .where(eq(clubs.id, club.id));
    await seedBeerForMember(club.id, memberC.id, user.id, 1);

    const created = await createAgreementTx({
      clubId: club.id,
      createdByUserId: user.id,
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
    await recordResultTx({
      agreementId: created.agreementId,
      clubId: club.id,
      recordedByUserId: user.id,
      winningSide: 'B',
    });
    const r = await reverseResultTx({
      agreementId: created.agreementId,
      clubId: club.id,
      reversedByUserId: user.id,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error();
    expect(r.voidedMatchCount).toBe(2);
    expect(r.voidedTransferCount).toBe(2);

    const matchRows = await testDb.select().from(matches);
    expect(matchRows.every((m) => m.voidedAt !== null)).toBe(true);
    const voids = await testDb.select().from(betTransferVoids);
    expect(voids).toHaveLength(2);

    const agreements = await testDb.select().from(matchAgreements);
    expect(agreements[0]?.resultRecordedAt).toBeNull();
    expect(agreements[0]?.reversedAt).not.toBeNull();
  });
});

describe('editAgreementTx + cancelAgreementTx — spec 013 US4', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
  });

  it('edit swaps lineup + flips pairing while OPEN', async () => {
    const { club, user, memberA, memberB, memberC, memberD } = await seedFourMembers();
    const created = await createAgreementTx({
      clubId: club.id,
      createdByUserId: user.id,
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
    const r = await editAgreementTx({
      agreementId: created.agreementId,
      clubId: club.id,
      input: {
        format: 'doubles',
        forBeer: false, // flipped
        sides: {
          A: { seat1: memberA.id, seat2: memberC.id }, // swap B↔C
          B: { seat1: memberB.id, seat2: memberD.id },
        },
        pairingKind: 'crossed', // flipped
      },
    });
    expect(r.ok).toBe(true);

    const agreement = await testDb.select().from(matchAgreements);
    expect(agreement[0]?.forBeer).toBe(false);
    expect(agreement[0]?.pairingKind).toBe('crossed');
    const sides = await testDb.select().from(matchAgreementSides);
    expect(sides).toHaveLength(4);
  });

  it('edit rejected after result recorded (NOT_EDITABLE)', async () => {
    const { club, user, memberA, memberB } = await seedFourMembers();
    const created = await createAgreementTx({
      clubId: club.id,
      createdByUserId: user.id,
      input: {
        format: 'singles',
        forBeer: false,
        sides: { A: { seat1: memberA.id }, B: { seat1: memberB.id } },
      },
    });
    if (!created.ok) throw new Error();
    await recordResultTx({
      agreementId: created.agreementId,
      clubId: club.id,
      recordedByUserId: user.id,
      winningSide: 'A',
    });
    const r = await editAgreementTx({
      agreementId: created.agreementId,
      clubId: club.id,
      input: {
        format: 'singles',
        forBeer: true,
        sides: { A: { seat1: memberB.id }, B: { seat1: memberA.id } },
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('NOT_EDITABLE');
  });

  it('cancel sets cancelled_at; second cancel rejects NOT_CANCELLABLE', async () => {
    const { club, user, memberA, memberB } = await seedFourMembers();
    const created = await createAgreementTx({
      clubId: club.id,
      createdByUserId: user.id,
      input: {
        format: 'singles',
        forBeer: true,
        sides: { A: { seat1: memberA.id }, B: { seat1: memberB.id } },
      },
    });
    if (!created.ok) throw new Error();
    const c1 = await cancelAgreementTx({
      agreementId: created.agreementId,
      clubId: club.id,
      cancelledByUserId: user.id,
    });
    expect(c1.ok).toBe(true);

    const agreement = await testDb.select().from(matchAgreements);
    expect(agreement[0]?.cancelledAt).not.toBeNull();

    const c2 = await cancelAgreementTx({
      agreementId: created.agreementId,
      clubId: club.id,
      cancelledByUserId: user.id,
    });
    expect(c2.ok).toBe(false);
    if (!c2.ok) expect(c2.code).toBe('NOT_CANCELLABLE');
  });

  it('cancel after reverse rejects NOT_CANCELLABLE (no chk_cancel_xor_result 500)', async () => {
    // Regression: record → reverse leaves reversed_at set + result null.
    // The cancel guard must include reversed_at IS NULL, else the UPDATE
    // matches and the DB CHECK constraint throws instead of a clean code.
    const { club, user, memberA, memberB } = await seedFourMembers();
    const created = await createAgreementTx({
      clubId: club.id,
      createdByUserId: user.id,
      input: {
        format: 'singles',
        forBeer: false,
        sides: { A: { seat1: memberA.id }, B: { seat1: memberB.id } },
      },
    });
    if (!created.ok) throw new Error();
    await recordResultTx({
      agreementId: created.agreementId,
      clubId: club.id,
      recordedByUserId: user.id,
      winningSide: 'A',
    });
    const rev = await reverseResultTx({
      agreementId: created.agreementId,
      clubId: club.id,
      reversedByUserId: user.id,
    });
    expect(rev.ok).toBe(true);

    const c = await cancelAgreementTx({
      agreementId: created.agreementId,
      clubId: club.id,
      cancelledByUserId: user.id,
    });
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.code).toBe('NOT_CANCELLABLE');

    // Row untouched: still reversed, not cancelled.
    const agreement = await testDb.select().from(matchAgreements);
    expect(agreement[0]?.cancelledAt).toBeNull();
    expect(agreement[0]?.reversedAt).not.toBeNull();
  });
});

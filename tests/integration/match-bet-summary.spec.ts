import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTestDb, type TestDb } from '../helpers/db';

let testDb: TestDb;

vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

import { matchBetSummaryForMember } from '@/lib/db/queries/match-bet-summary';

// Spec 018 T006 — integration coverage for the home-page query
// helper. Mirrors the seed style used by the other integration
// specs.

async function seedClubWithTwoMembers(db: TestDb, clubName = 'Test Club') {
  const [userA] = await db
    .insert((await import('@/lib/db/schema/auth')).users)
    .values({ email: `a-${Date.now()}-${Math.random()}@example.test`, name: 'A' })
    .returning();
  const [userB] = await db
    .insert((await import('@/lib/db/schema/auth')).users)
    .values({ email: `b-${Date.now()}-${Math.random()}@example.test`, name: 'B' })
    .returning();
  if (!userA || !userB) throw new Error('seed users');

  const [club] = await db
    .insert((await import('@/lib/db/schema/clubs')).clubs)
    .values({ name: clubName, currencyCode: 'CZK', defaultLocale: 'cs-CZ' })
    .returning();
  if (!club) throw new Error('seed club');

  const [memberA] = await db
    .insert((await import('@/lib/db/schema/members')).members)
    .values({ clubId: club.id, userId: userA.id, email: userA.email, displayName: 'A', role: 'member' })
    .returning();
  const [memberB] = await db
    .insert((await import('@/lib/db/schema/members')).members)
    .values({ clubId: club.id, userId: userB.id, email: userB.email, displayName: 'B', role: 'member' })
    .returning();
  if (!memberA || !memberB) throw new Error('seed members');

  const [session] = await db
    .insert((await import('@/lib/db/schema/sessions')).drinkSessions)
    .values({ clubId: club.id, openedByUserId: userA.id, startedAt: new Date() })
    .returning();
  if (!session) throw new Error('seed session');

  const [beer] = await db
    .insert((await import('@/lib/db/schema/catalog')).beerTypes)
    .values({
      clubId: club.id,
      name: 'Pilsner',
      unitPriceMinor: 5000n,
      currentStock: 100,
      createdByUserId: userA.id,
    })
    .returning();
  if (!beer) throw new Error('seed beer');

  return { club, userA, userB, memberA, memberB, session, beer };
}

async function seedBetLinkedConsumption(
  db: TestDb,
  args: {
    clubId: string;
    sessionId: string;
    winnerMemberId: string;
    loserMemberId: string;
    winnerUserId: string;
    beerId: string;
    createdAt?: Date;
  },
) {
  const { consumptions } = await import('@/lib/db/schema/consumption');
  const { betTransfers } = await import('@/lib/db/schema/bets');
  const { matches, matchBetTransfers, matchAgreements, matchAgreementSides } =
    await import('@/lib/db/schema/matches');

  // Agreement + sides — minimal scaffolding; the summary query only
  // joins through match_bet_transfers → matches, so we only need
  // matches to exist with a valid agreement_id.
  const [agreement] = await db
    .insert(matchAgreements)
    .values({
      clubId: args.clubId,
      format: 'singles',
      forBeer: true,
      createdByUserId: args.winnerUserId,
    })
    .returning();
  if (!agreement) throw new Error('seed agreement');
  await db.insert(matchAgreementSides).values([
    { agreementId: agreement.id, side: 'A', seat: 1, memberId: args.winnerMemberId },
    { agreementId: agreement.id, side: 'B', seat: 1, memberId: args.loserMemberId },
  ]);

  // The auto-created winner consumption.
  const [consumption] = await db
    .insert(consumptions)
    .values({
      clubId: args.clubId,
      drinkSessionId: args.sessionId,
      memberId: args.winnerMemberId,
      beerTypeId: args.beerId,
      unitPriceMinorSnapshot: 5000n,
      createdByUserId: args.winnerUserId,
      ...(args.createdAt ? { createdAt: args.createdAt } : {}),
    })
    .returning();
  if (!consumption) throw new Error('seed consumption');

  // Match row.
  const [match] = await db
    .insert(matches)
    .values({
      clubId: args.clubId,
      winnerMemberId: args.winnerMemberId,
      loserMemberId: args.loserMemberId,
      agreementId: agreement.id,
      createdByUserId: args.winnerUserId,
    })
    .returning();
  if (!match) throw new Error('seed match');

  // Bet transfer + link.
  const [transfer] = await db
    .insert(betTransfers)
    .values({
      clubId: args.clubId,
      sourceConsumptionId: consumption.id,
      fromMemberId: args.winnerMemberId,
      toMemberId: args.loserMemberId,
      createdByUserId: args.winnerUserId,
    })
    .returning();
  if (!transfer) throw new Error('seed transfer');
  await db.insert(matchBetTransfers).values({ matchId: match.id, betTransferId: transfer.id });

  return { consumption, transfer, match, agreement };
}

async function voidConsumption(db: TestDb, args: { clubId: string; consumptionId: string; userId: string }) {
  const { consumptionVoids } = await import('@/lib/db/schema/consumption');
  await db.insert(consumptionVoids).values({
    clubId: args.clubId,
    consumptionId: args.consumptionId,
    voidedByUserId: args.userId,
  });
}

describe('matchBetSummaryForMember — spec 018 home-page lookup', () => {
  beforeEach(async () => {
    const { db } = await makeTestDb();
    testDb = db;
  });

  it('returns 0 + [] when no bet-linked consumption exists for the member', async () => {
    const { club, memberB } = await seedClubWithTwoMembers(testDb);
    const summary = await matchBetSummaryForMember(memberB.id, club.id);
    expect(summary).toEqual({ betCount: 0, sourceMatchIds: [] });
  });

  it('returns the count + source match ids for a recent bet on the member', async () => {
    const { club, userA, memberA, memberB, session, beer } = await seedClubWithTwoMembers(testDb);
    const { agreement } = await seedBetLinkedConsumption(testDb, {
      clubId: club.id,
      sessionId: session.id,
      winnerMemberId: memberA.id,
      loserMemberId: memberB.id,
      winnerUserId: userA.id,
      beerId: beer.id,
    });
    const summary = await matchBetSummaryForMember(memberB.id, club.id);
    expect(summary.betCount).toBe(1);
    // The link target is the AGREEMENT (/match/[agreementId]), not the
    // internal matches row id.
    expect(summary.sourceMatchIds).toEqual([agreement.id]);
  });

  it('excludes voided bet-linked consumptions', async () => {
    const { club, userA, memberA, memberB, session, beer } = await seedClubWithTwoMembers(testDb);
    const { consumption } = await seedBetLinkedConsumption(testDb, {
      clubId: club.id,
      sessionId: session.id,
      winnerMemberId: memberA.id,
      loserMemberId: memberB.id,
      winnerUserId: userA.id,
      beerId: beer.id,
    });
    await voidConsumption(testDb, { clubId: club.id, consumptionId: consumption.id, userId: userA.id });
    const summary = await matchBetSummaryForMember(memberB.id, club.id);
    expect(summary).toEqual({ betCount: 0, sourceMatchIds: [] });
  });

  it('excludes bet-linked consumptions older than 24 hours', async () => {
    const { club, userA, memberA, memberB, session, beer } = await seedClubWithTwoMembers(testDb);
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await seedBetLinkedConsumption(testDb, {
      clubId: club.id,
      sessionId: session.id,
      winnerMemberId: memberA.id,
      loserMemberId: memberB.id,
      winnerUserId: userA.id,
      beerId: beer.id,
      createdAt: twoDaysAgo,
    });
    const summary = await matchBetSummaryForMember(memberB.id, club.id);
    expect(summary).toEqual({ betCount: 0, sourceMatchIds: [] });
  });

  it('aggregates multiple matches into a single summary', async () => {
    const { club, userA, memberA, memberB, session, beer } = await seedClubWithTwoMembers(testDb);
    const { agreement: agreement1 } = await seedBetLinkedConsumption(testDb, {
      clubId: club.id,
      sessionId: session.id,
      winnerMemberId: memberA.id,
      loserMemberId: memberB.id,
      winnerUserId: userA.id,
      beerId: beer.id,
    });
    const { agreement: agreement2 } = await seedBetLinkedConsumption(testDb, {
      clubId: club.id,
      sessionId: session.id,
      winnerMemberId: memberA.id,
      loserMemberId: memberB.id,
      winnerUserId: userA.id,
      beerId: beer.id,
    });
    const summary = await matchBetSummaryForMember(memberB.id, club.id);
    expect(summary.betCount).toBe(2);
    expect(new Set(summary.sourceMatchIds)).toEqual(new Set([agreement1.id, agreement2.id]));
  });

  it('scopes by club — no cross-club leakage', async () => {
    // Club A: member B (loser) has a bet.
    const a = await seedClubWithTwoMembers(testDb, 'Club A');
    await seedBetLinkedConsumption(testDb, {
      clubId: a.club.id,
      sessionId: a.session.id,
      winnerMemberId: a.memberA.id,
      loserMemberId: a.memberB.id,
      winnerUserId: a.userA.id,
      beerId: a.beer.id,
    });

    // Club B: separate club, separate world.
    const b = await seedClubWithTwoMembers(testDb, 'Club B');

    // Ask for A.memberB against B.club — should return empty
    // (different club_id filters the result).
    const summary = await matchBetSummaryForMember(a.memberB.id, b.club.id);
    expect(summary).toEqual({ betCount: 0, sourceMatchIds: [] });
  });
});

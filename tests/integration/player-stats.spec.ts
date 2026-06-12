import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTestDb, type TestDb } from '../helpers/db';

// Spec 034 — getPlayerStats: record/streaks, nemesis/victim, a doubles
// partner, beer aggregates, voided excluded.

let testDb: TestDb;
vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));
vi.mock('@/lib/balance/calculate', () => ({ memberBalance: async () => 1234n }));

import { getPlayerStats } from '@/lib/db/queries/player-stats';
import { users } from '@/lib/db/schema/auth';
import { clubs } from '@/lib/db/schema/clubs';
import { members } from '@/lib/db/schema/members';
import { beerTypes } from '@/lib/db/schema/catalog';
import { drinkSessions } from '@/lib/db/schema/sessions';
import { consumptions, consumptionVoids } from '@/lib/db/schema/consumption';
import { matches, matchAgreements, matchAgreementSides } from '@/lib/db/schema/matches';

let clubId: string;
let actorUserId: string;
async function mkMember(name: string) {
  const [u] = await testDb
    .insert(users)
    .values({ email: `${name}-${Math.random()}@x.test`, name, emailVerified: true })
    .returning();
  const [m] = await testDb
    .insert(members)
    .values({ clubId, userId: u!.id, email: u!.email, displayName: name, role: 'member', acceptedInvitationAt: new Date() })
    .returning();
  return { userId: u!.id, memberId: m!.id };
}
function single(w: string, l: string) {
  return testDb.insert(matches).values({ clubId, winnerMemberId: w, loserMemberId: l, playedAt: new Date(), createdByUserId: actorUserId });
}
async function doubles(a1: string, a2: string, b1: string, b2: string, winA: boolean) {
  const [ag] = await testDb
    .insert(matchAgreements)
    .values({ clubId, format: 'doubles', forBeer: false, pairingKind: 'straight', winningSide: winA ? 'A' : 'B', resultRecordedAt: new Date(), createdByUserId: actorUserId })
    .returning();
  await testDb.insert(matchAgreementSides).values([
    { agreementId: ag!.id, side: 'A', seat: 1, memberId: a1 },
    { agreementId: ag!.id, side: 'A', seat: 2, memberId: a2 },
    { agreementId: ag!.id, side: 'B', seat: 1, memberId: b1 },
    { agreementId: ag!.id, side: 'B', seat: 2, memberId: b2 },
  ]);
  // straight pairs A1↔B1, A2↔B2; winners on the winning side.
  const pair = (x: string, y: string) =>
    testDb.insert(matches).values({ clubId, winnerMemberId: winA ? x : y, loserMemberId: winA ? y : x, agreementId: ag!.id, playedAt: new Date(), createdByUserId: actorUserId });
  await pair(a1, b1);
  await pair(a2, b2);
}

describe('getPlayerStats (spec 034)', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
    const [club] = await testDb.insert(clubs).values({ name: 'TK', currencyCode: 'CZK', defaultLocale: 'cs' }).returning();
    clubId = club!.id;
  });

  it('computes record, nemesis/victim, a doubles partner, and beer aggregates', async () => {
    const a = await mkMember('Adam');
    actorUserId = a.userId;
    const b = await mkMember('Bohuš');
    const c = await mkMember('Cyril');
    const d = await mkMember('Dan');
    const e = await mkMember('Emil');
    const f = await mkMember('Filip');

    // Singles: B beats Adam 4× (nemesis); Adam beats Cyril 3× (favourite victim).
    for (let i = 0; i < 4; i++) await single(b.memberId, a.memberId);
    for (let i = 0; i < 3; i++) await single(a.memberId, c.memberId);
    // Doubles: Adam+Dan vs Emil+Filip, win 2, lose 1 → partner Dan (3 games, 2 wins).
    await doubles(a.memberId, d.memberId, e.memberId, f.memberId, true);
    await doubles(a.memberId, d.memberId, e.memberId, f.memberId, true);
    await doubles(a.memberId, d.memberId, e.memberId, f.memberId, false);

    // Beers: Adam 4 Pilsner + 1 Kozel (+1 voided), across 2 sessions.
    const [pils] = await testDb.insert(beerTypes).values({ clubId, name: 'Pilsner', unitPriceMinor: 45n, currentStock: 100, createdByUserId: a.userId }).returning();
    const [kozel] = await testDb.insert(beerTypes).values({ clubId, name: 'Kozel', unitPriceMinor: 38n, currentStock: 100, createdByUserId: a.userId }).returning();
    const [s1] = await testDb.insert(drinkSessions).values({ clubId, openedByUserId: a.userId, startedAt: new Date(), endedAt: new Date() }).returning();
    const [s2] = await testDb.insert(drinkSessions).values({ clubId, openedByUserId: a.userId, startedAt: new Date(), endedAt: new Date() }).returning();
    const con = (sid: string, beerId: string) =>
      testDb.insert(consumptions).values({ clubId, drinkSessionId: sid, memberId: a.memberId, beerTypeId: beerId, unitPriceMinorSnapshot: 45n, createdByUserId: a.userId }).returning().then((r) => r[0]!.id);
    await con(s1!.id, pils!.id);
    await con(s1!.id, pils!.id);
    await con(s2!.id, pils!.id);
    await con(s2!.id, pils!.id);
    await con(s2!.id, kozel!.id);
    const voided = await con(s2!.id, kozel!.id);
    await testDb.insert(consumptionVoids).values({ clubId, consumptionId: voided, voidedByUserId: a.userId });

    const stats = (await getPlayerStats({ clubId, memberId: a.memberId }))!;

    // Singles record (doubles add Adam↔Emil rows too): won 3(C)+2(dbl), lost 4(B)+1(dbl).
    expect(stats.won).toBe(5);
    expect(stats.lost).toBe(5);
    expect(stats.matchesPlayed).toBe(10);
    expect(stats.nemesis?.displayName).toBe('Bohuš');
    expect(stats.favouriteVictim?.displayName).toBe('Cyril');
    expect(stats.bestPartner?.displayName).toBe('Dan');
    expect(stats.bestPartner).toMatchObject({ wins: 2, games: 3 });
    // Beers: 5 non-voided (voided excluded), favourite Pilsner, 2 sessions → 2.5/night.
    expect(stats.totalBeers).toBe(5);
    expect(stats.favouriteBeer?.name).toBe('Pilsner');
    expect(stats.beersPerNight).toBe(2.5);
    expect(stats.tabMinor).toBe(1234n);
  });

  it('returns null for a member outside the club', async () => {
    const res = await getPlayerStats({ clubId, memberId: '11111111-1111-4111-8111-111111111111' });
    expect(res).toBeNull();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTestDb, type TestDb } from '../helpers/db';

// Spec 037 — the "Most badges" board: ranks members by held-badge count,
// club-scoped, all-time under both scopes, zero-badge members omitted.

let testDb: TestDb;
vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

import { getLeaderboards } from '@/lib/db/queries/leaderboards';
import { users } from '@/lib/db/schema/auth';
import { clubs } from '@/lib/db/schema/clubs';
import { members } from '@/lib/db/schema/members';
import { memberAchievements } from '@/lib/db/schema/achievements';

async function mkMember(clubId: string, name: string) {
  const [u] = await testDb
    .insert(users)
    .values({ email: `${name}-${Math.random()}@x.test`, name, emailVerified: true })
    .returning();
  const [m] = await testDb
    .insert(members)
    .values({ clubId, userId: u!.id, email: u!.email, displayName: name, role: 'member', acceptedInvitationAt: new Date() })
    .returning();
  return m!.id;
}

async function award(clubId: string, memberId: string, keys: string[]) {
  if (keys.length === 0) return;
  await testDb
    .insert(memberAchievements)
    .values(keys.map((badgeKey) => ({ clubId, memberId, badgeKey })));
}

describe('getLeaderboards — badges board (spec 037)', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
  });

  it('ranks by held-badge count, club-scoped, viewer row, all-time under both scopes', async () => {
    const [club] = await testDb.insert(clubs).values({ name: 'TK', currencyCode: 'CZK', defaultLocale: 'cs' }).returning();
    const a = await mkMember(club!.id, 'Adam'); // 3 badges
    const b = await mkMember(club!.id, 'Bohuš'); // 1 badge
    const c = await mkMember(club!.id, 'Cyril'); // 0 badges → omitted
    await award(club!.id, a, ['centuryClub', 'winner', 'onFire']);
    await award(club!.id, b, ['regular']);

    // Another club's badges must not leak in.
    const [club2] = await testDb.insert(clubs).values({ name: 'Other', currencyCode: 'CZK', defaultLocale: 'cs' }).returning();
    const outsider = await mkMember(club2!.id, 'Outsider');
    await award(club2!.id, outsider, ['centuryClub', 'winner', 'regular', 'nightOwl']);

    const allTime = await getLeaderboards({ clubId: club!.id, viewerMemberId: b, scope: 'allTime' });
    const badges = allTime.find((bd) => bd.key === 'badges')!;

    expect(badges.rows[0]).toMatchObject({ memberId: a, value: 3, rank: 1 });
    expect(badges.rows[1]).toMatchObject({ memberId: b, value: 1, rank: 2 });
    // Cyril (0 badges) is omitted; Outsider (other club) absent.
    expect(badges.rows.map((r) => r.memberId)).not.toContain(c);
    expect(badges.rows.map((r) => r.displayName)).not.toContain('Outsider');
    // viewer (Bohuš) row resolves.
    expect(badges.viewerRow?.memberId).toBe(b);

    // Season scope → identical badge counts (all-time, ignores the window).
    const season = await getLeaderboards({ clubId: club!.id, viewerMemberId: b, scope: 'season' });
    const seasonBadges = season.find((bd) => bd.key === 'badges')!;
    expect(seasonBadges.rows.map((r) => [r.memberId, r.value])).toEqual(
      badges.rows.map((r) => [r.memberId, r.value]),
    );
  });
});

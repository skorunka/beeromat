import 'server-only';
import { and, count, desc, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { members } from '@/lib/db/schema/members';
import { memberAchievements } from '@/lib/db/schema/achievements';
import { getPlayerStats } from '@/lib/db/queries/player-stats';
import { qualifyingBadgeKeys } from '@/lib/achievements/catalog';
import type { BadgeKey } from '@/lib/achievements/types';

// Spec 035 — persistence for sticky badge unlocks. The badge catalog (what each
// key means) lives in lib/achievements/; this module only writes/reads the
// member_achievements table. Reconcile is insert-if-absent (never deletes), so a
// later void that lowers a stat never strips an earned badge.

/**
 * Award every badge the member currently qualifies for that they don't already
 * hold. Returns the keys NEWLY inserted by THIS call (for the unlock celebration).
 * Idempotent: a re-run with nothing new returns []. Concurrency-safe via the
 * (member_id, badge_key) unique index as the conflict target — a racing duplicate
 * is swallowed and reported as not-new, so no double celebration.
 *
 * MUST be called AFTER the mutating transaction commits (it reads live stats via
 * the global client). MUST NOT be called during a page render.
 */
export async function reconcileAchievements(args: {
  clubId: string;
  memberId: string;
}): Promise<BadgeKey[]> {
  const stats = await getPlayerStats({ clubId: args.clubId, memberId: args.memberId });
  if (!stats) return [];

  const want = qualifyingBadgeKeys(stats);
  if (want.length === 0) return [];

  const inserted = await db
    .insert(memberAchievements)
    .values(
      want.map((badgeKey) => ({
        clubId: args.clubId,
        memberId: args.memberId,
        badgeKey,
      })),
    )
    .onConflictDoNothing({
      target: [memberAchievements.memberId, memberAchievements.badgeKey],
    })
    .returning({ badgeKey: memberAchievements.badgeKey });

  return inserted.map((r) => r.badgeKey as BadgeKey);
}

/**
 * Reconcile a set of members whose stats just changed, swallowing any error so a
 * predicate bug or DB hiccup never fails the underlying action (FR-019). Returns
 * the ACTOR's newly-earned keys (for the in-the-moment celebration); other
 * members are reconciled silently (they aren't at the screen, no notifications in
 * v1). Must be called AFTER the mutating transaction commits.
 */
export async function reconcileAndCollect(args: {
  clubId: string;
  memberIds: string[];
  actorMemberId: string;
}): Promise<BadgeKey[]> {
  let actorKeys: BadgeKey[] = [];
  for (const memberId of new Set(args.memberIds)) {
    try {
      const keys = await reconcileAchievements({ clubId: args.clubId, memberId });
      if (memberId === args.actorMemberId) actorKeys = keys;
    } catch (err) {
      console.error(`reconcileAchievements failed for member ${memberId}`, err);
    }
  }
  return actorKeys;
}

/** Badges a member currently holds, newest-earned first. For the profile gallery. */
export async function getEarnedBadges(args: {
  clubId: string;
  memberId: string;
}): Promise<{ key: BadgeKey; earnedAt: Date }[]> {
  const rows = await db
    .select({ key: memberAchievements.badgeKey, earnedAt: memberAchievements.earnedAt })
    .from(memberAchievements)
    .where(
      and(
        eq(memberAchievements.clubId, args.clubId),
        eq(memberAchievements.memberId, args.memberId),
      ),
    )
    .orderBy(desc(memberAchievements.earnedAt));
  return rows.map((r) => ({ key: r.key as BadgeKey, earnedAt: r.earnedAt }));
}

/**
 * US3 rarity — how many members hold each badge, plus the club's active-member
 * count. One GROUP BY + one count. Keys nobody holds are simply absent (callers
 * treat missing as 0).
 */
export async function getClubBadgeRarity(args: {
  clubId: string;
}): Promise<{ holdersByKey: Record<BadgeKey, number>; clubMembers: number }> {
  const [counts, memberCountRow] = await Promise.all([
    db
      .select({ key: memberAchievements.badgeKey, n: count() })
      .from(memberAchievements)
      .where(eq(memberAchievements.clubId, args.clubId))
      .groupBy(memberAchievements.badgeKey),
    // Count ALL club members (not just active): badges are sticky and awarded to
    // every member, so an inactive holder must not make holders > clubMembers
    // ("52 of 51"). The whole-club denominator keeps holders ≤ total.
    db
      .select({ n: count() })
      .from(members)
      .where(eq(members.clubId, args.clubId))
      .then((r) => r[0]),
  ]);
  const holdersByKey = {} as Record<BadgeKey, number>;
  for (const c of counts) holdersByKey[c.key as BadgeKey] = c.n;
  return { holdersByKey, clubMembers: memberCountRow?.n ?? 0 };
}

/**
 * Backfill: award every currently-qualifying badge to every member of the club,
 * stamping newly-inserted rows with `stampAt` (a single release timestamp) instead
 * of now() — so historical earns don't read as "unlocked today". Re-run-safe
 * (insert-if-absent). Returns the total number of rows inserted. Used once by
 * scripts/backfill-achievements.ts.
 */
export async function reconcileAllClubMembers(args: {
  clubId: string;
  stampAt: Date;
}): Promise<number> {
  const roster = await db
    .select({ id: members.id })
    .from(members)
    .where(eq(members.clubId, args.clubId));

  let insertedTotal = 0;
  for (const m of roster) {
    const stats = await getPlayerStats({ clubId: args.clubId, memberId: m.id });
    if (!stats) continue;
    const want = qualifyingBadgeKeys(stats);
    if (want.length === 0) continue;

    const inserted = await db
      .insert(memberAchievements)
      .values(
        want.map((badgeKey) => ({
          clubId: args.clubId,
          memberId: m.id,
          badgeKey,
          earnedAt: args.stampAt,
        })),
      )
      .onConflictDoNothing({
        target: [memberAchievements.memberId, memberAchievements.badgeKey],
      })
      .returning({ badgeKey: memberAchievements.badgeKey });
    insertedTotal += inserted.length;
  }
  return insertedTotal;
}

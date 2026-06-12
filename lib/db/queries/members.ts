import 'server-only';
import { and, asc, desc, eq, ne, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { members } from '@/lib/db/schema/members';
import { consumptions } from '@/lib/db/schema/consumption';

// Spec 024 — picker-shaped member-list query for /log/for's
// on-behalf member picker. Returns active members of the club
// other than the caller, ordered by displayName, with the
// avatar fields the MemberPickerGrid needs to render each tile's
// face.

export interface PickerMemberRow {
  id: string;
  displayName: string;
  avatarKey: string | null;
  avatarUploadAt: Date | null;
}

export async function listOtherActiveMembers(
  clubId: string,
  excludingMemberId: string,
): Promise<PickerMemberRow[]> {
  return db
    .select({
      id: members.id,
      displayName: members.displayName,
      avatarKey: members.avatarKey,
      avatarUploadAt: members.avatarUploadAt,
    })
    .from(members)
    .where(
      and(
        eq(members.clubId, clubId),
        eq(members.isActive, true),
        ne(members.id, excludingMemberId),
      ),
    )
    .orderBy(asc(members.displayName));
}

// Spec 033 — roster for the "log a round" multi-select. Unlike
// listOtherActiveMembers, this INCLUDES the caller (the fetcher is
// normally drinking too) and flags them so the picker can pre-select +
// label "(ty)".
//
// 033 follow-up (big-club ergonomics): the roster is ordered self-first,
// then the caller's RECENT COMPANIONS (members they've recently logged
// beers for — their usual table) by recency, then everyone else
// alphabetically. `recent` flags the companion cluster. With ~50
// members this floats your crew to the top; the picker also offers a
// search filter + a "repeat last round" shortcut on the client.
export interface RoundMemberRow extends PickerMemberRow {
  isSelf: boolean;
  recent: boolean;
}

export async function listActiveMembersForRound(
  clubId: string,
  selfMemberId: string,
  selfUserId: string,
): Promise<RoundMemberRow[]> {
  const [rows, companions] = await Promise.all([
    db
      .select({
        id: members.id,
        displayName: members.displayName,
        avatarKey: members.avatarKey,
        avatarUploadAt: members.avatarUploadAt,
      })
      .from(members)
      .where(and(eq(members.clubId, clubId), eq(members.isActive, true)))
      .orderBy(asc(members.displayName)),
    // Members the caller has recently logged beers FOR (on-behalf),
    // most-recent first — a good proxy for "the people at my table".
    db
      .select({ memberId: consumptions.memberId })
      .from(consumptions)
      .where(
        and(
          eq(consumptions.clubId, clubId),
          eq(consumptions.createdByUserId, selfUserId),
          ne(consumptions.memberId, selfMemberId),
        ),
      )
      .groupBy(consumptions.memberId)
      .orderBy(desc(sql`max(${consumptions.createdAt})`))
      .limit(20),
  ]);

  const rank = new Map(companions.map((c, i) => [c.memberId, i]));
  return rows
    .map((r) => ({ ...r, isSelf: r.id === selfMemberId, recent: rank.has(r.id) }))
    .sort((a, b) => {
      if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
      const ra = rank.has(a.id) ? rank.get(a.id)! : Infinity;
      const rb = rank.has(b.id) ? rank.get(b.id)! : Infinity;
      if (ra !== rb) return ra - rb;
      return a.displayName.localeCompare(b.displayName);
    });
}

import 'server-only';
import { and, asc, eq, ne } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { members } from '@/lib/db/schema/members';

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

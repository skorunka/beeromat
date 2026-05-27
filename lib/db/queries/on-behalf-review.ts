import 'server-only';
import { and, desc, eq, isNull, ne } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema/auth';
import { beerTypes } from '@/lib/db/schema/catalog';
import { consumptions, consumptionVoids } from '@/lib/db/schema/consumption';
import { members } from '@/lib/db/schema/members';

// Spec 026 — alias on members so we can join the LOGGER's
// member row alongside the existing consumer-resolution lookup,
// and pull the logger's id + avatar fields for the banner.
const loggerMembers = alias(members, 'logger_members');

// Spec 019 — home-page lookup: for the active member in the
// active club, return the on-behalf consumptions that haven't
// been reviewed (dismissed) or voided yet.
//
// An on-behalf row is one where `created_by_user_id` differs
// from the consumer's `user_id`. The home banner uses this
// summary to render the proactive notification per FR-005.

export interface OnBehalfReviewRow {
  consumptionId: string;
  loggerDisplayName: string;
  /** Spec 026 — logger member id + avatar fields, used by the
   *  home banner to render <MemberAvatar /> inline. Null only
   *  in the edge case where the logger's member row was hard-
   *  deleted (FK should prevent this; null kept for safety). */
  loggerMemberId: string | null;
  loggerAvatarKey: string | null;
  loggerAvatarUploadAt: Date | null;
  beerName: string;
  createdAt: Date;
}

export interface OnBehalfReviewSummary {
  count: number;
  rows: OnBehalfReviewRow[];
}

export async function onBehalfReviewSummaryForMember(
  memberId: string,
  clubId: string,
): Promise<OnBehalfReviewSummary> {
  // Resolve the consumer's user_id from members (single point of
  // truth). Used to filter OUT self-logged rows.
  const consumerMember = await db
    .select({ userId: members.userId })
    .from(members)
    .where(eq(members.id, memberId))
    .limit(1);
  const consumerUserId = consumerMember[0]?.userId;
  if (!consumerUserId) {
    return { count: 0, rows: [] };
  }

  const rows = await db
    .select({
      consumptionId: consumptions.id,
      loggerDisplayName: users.name,
      loggerMemberId: loggerMembers.id,
      loggerAvatarKey: loggerMembers.avatarKey,
      loggerAvatarUploadAt: loggerMembers.avatarUploadAt,
      beerName: beerTypes.name,
      createdAt: consumptions.createdAt,
    })
    .from(consumptions)
    .innerJoin(users, eq(users.id, consumptions.createdByUserId))
    .leftJoin(
      loggerMembers,
      and(
        eq(loggerMembers.userId, consumptions.createdByUserId),
        eq(loggerMembers.clubId, consumptions.clubId),
      ),
    )
    .innerJoin(beerTypes, eq(beerTypes.id, consumptions.beerTypeId))
    .leftJoin(consumptionVoids, eq(consumptionVoids.consumptionId, consumptions.id))
    .where(
      and(
        eq(consumptions.memberId, memberId),
        eq(consumptions.clubId, clubId),
        ne(consumptions.createdByUserId, consumerUserId),
        isNull(consumptions.onBehalfReviewedAt),
        isNull(consumptionVoids.consumptionId),
      ),
    )
    .orderBy(desc(consumptions.createdAt));

  return {
    count: rows.length,
    rows: rows.map((r) => ({
      consumptionId: r.consumptionId,
      loggerDisplayName: r.loggerDisplayName,
      loggerMemberId: r.loggerMemberId,
      loggerAvatarKey: r.loggerAvatarKey,
      loggerAvatarUploadAt: r.loggerAvatarUploadAt,
      beerName: r.beerName,
      createdAt: r.createdAt,
    })),
  };
}

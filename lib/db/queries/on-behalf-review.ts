import 'server-only';
import { and, desc, eq, isNull, ne } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema/auth';
import { beerTypes } from '@/lib/db/schema/catalog';
import { consumptions, consumptionVoids } from '@/lib/db/schema/consumption';
import { members } from '@/lib/db/schema/members';

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
      beerName: beerTypes.name,
      createdAt: consumptions.createdAt,
    })
    .from(consumptions)
    .innerJoin(users, eq(users.id, consumptions.createdByUserId))
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
      beerName: r.beerName,
      createdAt: r.createdAt,
    })),
  };
}

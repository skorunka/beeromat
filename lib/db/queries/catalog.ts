import 'server-only';
import { and, asc, eq, isNotNull, isNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { beerTypes } from '@/lib/db/schema/catalog';
import { consumptions, consumptionVoids } from '@/lib/db/schema/consumption';

export interface BeerTypeView {
  id: string;
  name: string;
  unitPriceMinor: bigint;
  buyPriceMinor: bigint | null;
  currentStock: number;
  lowStockThreshold: number;
  isLowStock: boolean;
  isOutOfStock: boolean;
  isArchived: boolean;
  displayOrder: number;
}

/**
 * The catalog view used by the log screen (and the admin beer-types
 * screen when includeArchived is true).
 */
export async function getBeerTypeCatalog(
  clubId: string,
  options: { includeArchived?: boolean } = {},
): Promise<BeerTypeView[]> {
  const where = options.includeArchived
    ? eq(beerTypes.clubId, clubId)
    : and(eq(beerTypes.clubId, clubId), eq(beerTypes.isArchived, false));

  const rows = await db
    .select()
    .from(beerTypes)
    .where(where)
    .orderBy(asc(beerTypes.displayOrder), asc(beerTypes.name));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    unitPriceMinor: r.unitPriceMinor,
    buyPriceMinor: r.buyPriceMinor,
    currentStock: r.currentStock,
    lowStockThreshold: r.lowStockThreshold,
    isLowStock: r.currentStock <= r.lowStockThreshold && r.currentStock > 0,
    isOutOfStock: r.currentStock === 0,
    isArchived: r.isArchived,
    displayOrder: r.displayOrder,
  }));
}

export interface ClubMarginSummary {
  totalMarginMinor: bigint;
  untrackedBeerCount: number;
}

/**
 * Spec 011 — total beer margin across the club. Sums
 * (sell_price - buy_price) * non_voided_consumption_count for every
 * non-archived beer type whose buy_price_minor IS NOT NULL.
 *
 * The returned `untrackedBeerCount` is how many ACTIVE beer types
 * still lack a buy price — the treasurer's nudge to fill them in.
 */
export async function getClubMarginSummary(clubId: string): Promise<ClubMarginSummary> {
  const tracked = await db
    .select({
      total: sql<string>`coalesce(sum((${beerTypes.unitPriceMinor} - ${beerTypes.buyPriceMinor}) * (
        SELECT count(*) FROM ${consumptions} c
        WHERE c.beer_type_id = ${beerTypes.id}
          AND NOT EXISTS (
            SELECT 1 FROM ${consumptionVoids} cv WHERE cv.consumption_id = c.id
          )
      )), 0)::text`,
    })
    .from(beerTypes)
    .where(
      and(
        eq(beerTypes.clubId, clubId),
        eq(beerTypes.isArchived, false),
        isNotNull(beerTypes.buyPriceMinor),
      ),
    );

  const untracked = await db
    .select({ n: sql<string>`count(*)::text` })
    .from(beerTypes)
    .where(
      and(
        eq(beerTypes.clubId, clubId),
        eq(beerTypes.isArchived, false),
        isNull(beerTypes.buyPriceMinor),
      ),
    );

  return {
    totalMarginMinor: BigInt(tracked[0]?.total ?? '0'),
    untrackedBeerCount: Number(untracked[0]?.n ?? '0'),
  };
}

import 'server-only';
import { and, asc, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { beerTypes } from '@/lib/db/schema/catalog';

export interface BeerTypeView {
  id: string;
  name: string;
  unitPriceMinor: bigint;
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
    currentStock: r.currentStock,
    lowStockThreshold: r.lowStockThreshold,
    isLowStock: r.currentStock <= r.lowStockThreshold && r.currentStock > 0,
    isOutOfStock: r.currentStock === 0,
    isArchived: r.isArchived,
    displayOrder: r.displayOrder,
  }));
}

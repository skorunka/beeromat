import 'server-only';
import { and, desc, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema/auth';
import { beerTypes, stockChanges } from '@/lib/db/schema/catalog';
import type { StockChange } from '@/lib/db/schema/catalog';

export interface StockChangeRow {
  id: string;
  beerTypeId: string;
  beerTypeName: string;
  delta: number;
  kind: StockChange['kind'];
  reason: string | null;
  createdAt: Date;
  createdByUserId: string;
  createdByDisplayName: string;
}

/**
 * Audit log of stock changes (contracts/stock.md → getStockHistory),
 * newest first, optionally scoped to one beer type.
 */
export async function getStockHistory(args: {
  clubId: string;
  beerTypeId?: string;
  limit?: number;
}): Promise<StockChangeRow[]> {
  const rows = await db
    .select({
      id: stockChanges.id,
      beerTypeId: stockChanges.beerTypeId,
      beerTypeName: beerTypes.name,
      delta: stockChanges.delta,
      kind: stockChanges.kind,
      reason: stockChanges.reason,
      createdAt: stockChanges.createdAt,
      createdByUserId: stockChanges.createdByUserId,
      createdByDisplayName: users.name,
    })
    .from(stockChanges)
    .innerJoin(beerTypes, eq(beerTypes.id, stockChanges.beerTypeId))
    .innerJoin(users, eq(users.id, stockChanges.createdByUserId))
    .where(
      and(
        eq(stockChanges.clubId, args.clubId),
        args.beerTypeId ? eq(stockChanges.beerTypeId, args.beerTypeId) : undefined,
      ),
    )
    .orderBy(desc(stockChanges.createdAt))
    .limit(args.limit ?? 100);
  return rows;
}

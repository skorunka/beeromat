'use server';

import { and, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { db } from '@/lib/db/client';
import { requireRole } from '@/lib/auth/session';
import { beerTypes, stockChanges } from '@/lib/db/schema/catalog';

// US7 — beer-type catalog + stock management. contracts/stock.md.
// Role: stock_manager or club_admin throughout.

function revalidateStockViews(): void {
  revalidatePath('/admin/beer-types');
  revalidatePath('/log');
}

/** Case-insensitive active-name collision check within a club. */
async function nameTaken(clubId: string, name: string, excludeId?: string): Promise<boolean> {
  const rows = await db
    .select({ id: beerTypes.id })
    .from(beerTypes)
    .where(
      and(
        eq(beerTypes.clubId, clubId),
        eq(beerTypes.isArchived, false),
        sql`lower(${beerTypes.name}) = lower(${name})`,
      ),
    );
  return rows.some((r) => r.id !== excludeId);
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  unitPriceMinor: z.string().regex(/^\d+$/),
  // Spec 011 — optional buy price (minor units, decimal-string).
  // null and undefined both mean "no buy price set".
  buyPriceMinor: z.string().regex(/^\d+$/).nullable().optional(),
  initialStock: z.number().int().nonnegative(),
  lowStockThreshold: z.number().int().nonnegative(),
  displayOrder: z.number().int().optional(),
});

export type CreateBeerTypeResult =
  | { ok: true; beerTypeId: string }
  | { ok: false; code: 'DUPLICATE_NAME' | 'INVALID_INPUT' | 'BUY_ABOVE_SELL' };

export async function createBeerTypeAction(rawInput: unknown): Promise<CreateBeerTypeResult> {
  const ctx = await requireRole('stock_manager', 'club_admin');
  const parsed = createSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, code: 'INVALID_INPUT' };
  const input = parsed.data;

  const unitPriceMinor = BigInt(input.unitPriceMinor);
  if (unitPriceMinor <= 0n) return { ok: false, code: 'INVALID_INPUT' };
  const buyPriceMinor =
    input.buyPriceMinor != null ? BigInt(input.buyPriceMinor) : null;
  if (buyPriceMinor !== null && buyPriceMinor > unitPriceMinor) {
    // FR-004 defence-in-depth: client schema enforces this too but
    // crafted POSTs can bypass the client.
    return { ok: false, code: 'BUY_ABOVE_SELL' };
  }
  if (await nameTaken(ctx.club.id, input.name)) {
    return { ok: false, code: 'DUPLICATE_NAME' };
  }

  const beerTypeId = await db.transaction(async (tx) => {
    let displayOrder = input.displayOrder;
    if (displayOrder === undefined) {
      const [{ max } = { max: 0 }] = await tx
        .select({ max: sql<number>`coalesce(max(${beerTypes.displayOrder}), 0)` })
        .from(beerTypes)
        .where(eq(beerTypes.clubId, ctx.club.id));
      displayOrder = Number(max) + 10;
    }

    const [row] = await tx
      .insert(beerTypes)
      .values({
        clubId: ctx.club.id,
        name: input.name,
        unitPriceMinor,
        buyPriceMinor,
        currentStock: input.initialStock,
        lowStockThreshold: input.lowStockThreshold,
        displayOrder,
        createdByUserId: ctx.user.id,
      })
      .returning({ id: beerTypes.id });
    if (!row) throw new Error('createBeerType: insert failed');

    if (input.initialStock > 0) {
      await tx.insert(stockChanges).values({
        clubId: ctx.club.id,
        beerTypeId: row.id,
        delta: input.initialStock,
        kind: 'restock',
        // Stable marker (not display prose) — the stock-history view
        // maps it to a localized label. Storing English here is the
        // bug we're fixing: `reason` is free-text for adjustments, so
        // this sentinel is the one value the UI translates.
        reason: 'initial',
        createdByUserId: ctx.user.id,
      });
    }
    return row.id;
  });

  revalidateStockViews();
  return { ok: true, beerTypeId };
}

const updateSchema = z.object({
  id: z.string().uuid(),
  patch: z.object({
    name: z.string().trim().min(1).max(120).optional(),
    unitPriceMinor: z.string().regex(/^\d+$/).optional(),
    // Spec 011 — optional buy-price patch. Explicit `null` means
    // "clear it"; undefined means "don't touch".
    buyPriceMinor: z.string().regex(/^\d+$/).nullable().optional(),
    lowStockThreshold: z.number().int().nonnegative().optional(),
    displayOrder: z.number().int().optional(),
  }),
});

export type UpdateBeerTypeResult =
  | { ok: true }
  | { ok: false; code: 'NOT_FOUND' | 'DUPLICATE_NAME' | 'INVALID_INPUT' | 'BUY_ABOVE_SELL' };

export async function updateBeerTypeAction(rawInput: unknown): Promise<UpdateBeerTypeResult> {
  const ctx = await requireRole('stock_manager', 'club_admin');
  const parsed = updateSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, code: 'INVALID_INPUT' };
  const { id, patch } = parsed.data;

  const existing = await db.query.beerTypes.findFirst({
    where: and(eq(beerTypes.id, id), eq(beerTypes.clubId, ctx.club.id)),
  });
  if (!existing) return { ok: false, code: 'NOT_FOUND' };

  if (patch.name && (await nameTaken(ctx.club.id, patch.name, id))) {
    return { ok: false, code: 'DUPLICATE_NAME' };
  }

  // Changing the price never rewrites past consumptions' snapshots.
  const set: Partial<typeof beerTypes.$inferInsert> = {};
  if (patch.name !== undefined) set.name = patch.name;
  let nextSell = existing.unitPriceMinor;
  if (patch.unitPriceMinor !== undefined) {
    const price = BigInt(patch.unitPriceMinor);
    if (price <= 0n) return { ok: false, code: 'INVALID_INPUT' };
    set.unitPriceMinor = price;
    nextSell = price;
  }
  if (patch.buyPriceMinor !== undefined) {
    if (patch.buyPriceMinor === null) {
      set.buyPriceMinor = null;
    } else {
      const buy = BigInt(patch.buyPriceMinor);
      if (buy > nextSell) {
        // FR-004 defence-in-depth.
        return { ok: false, code: 'BUY_ABOVE_SELL' };
      }
      set.buyPriceMinor = buy;
    }
  }
  if (patch.lowStockThreshold !== undefined) set.lowStockThreshold = patch.lowStockThreshold;
  if (patch.displayOrder !== undefined) set.displayOrder = patch.displayOrder;

  if (Object.keys(set).length > 0) {
    // Spec 027 defence-in-depth — the read above already scoped to
    // the caller's club, so an unscoped UPDATE-by-id is safe in
    // practice. But carrying the club_id through the WHERE means
    // a future refactor of the read step can't accidentally widen
    // the write surface.
    await db
      .update(beerTypes)
      .set(set)
      .where(and(eq(beerTypes.id, id), eq(beerTypes.clubId, ctx.club.id)));
  }
  revalidateStockViews();
  return { ok: true };
}

export type ArchiveResult = { ok: true } | { ok: false; code: 'NOT_FOUND' };

async function setArchived(id: string, archived: boolean): Promise<ArchiveResult> {
  const ctx = await requireRole('stock_manager', 'club_admin');
  const updated = await db
    .update(beerTypes)
    .set({ isArchived: archived })
    .where(and(eq(beerTypes.id, id), eq(beerTypes.clubId, ctx.club.id)))
    .returning({ id: beerTypes.id });
  if (updated.length === 0) return { ok: false, code: 'NOT_FOUND' };
  revalidateStockViews();
  return { ok: true };
}

export async function archiveBeerTypeAction(rawId: unknown): Promise<ArchiveResult> {
  const id = z.string().uuid().safeParse(rawId);
  if (!id.success) return { ok: false, code: 'NOT_FOUND' };
  return setArchived(id.data, true);
}

export async function unarchiveBeerTypeAction(rawId: unknown): Promise<ArchiveResult> {
  const id = z.string().uuid().safeParse(rawId);
  if (!id.success) return { ok: false, code: 'NOT_FOUND' };
  return setArchived(id.data, false);
}

const restockSchema = z.object({
  beerTypeId: z.string().uuid(),
  quantity: z.number().int().positive(),
  reason: z.string().max(500).optional(),
});

export type StockChangeResult =
  | { ok: true; newStock: number }
  | { ok: false; code: 'NOT_FOUND' | 'ARCHIVED' | 'WOULD_GO_NEGATIVE' | 'INVALID_INPUT' };

export async function recordRestockAction(rawInput: unknown): Promise<StockChangeResult> {
  const ctx = await requireRole('stock_manager', 'club_admin');
  const parsed = restockSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, code: 'INVALID_INPUT' };
  const { beerTypeId, quantity, reason } = parsed.data;

  return db.transaction(async (tx) => {
    const beer = await tx.query.beerTypes.findFirst({
      where: and(eq(beerTypes.id, beerTypeId), eq(beerTypes.clubId, ctx.club.id)),
    });
    if (!beer) return { ok: false, code: 'NOT_FOUND' } as const;
    if (beer.isArchived) return { ok: false, code: 'ARCHIVED' } as const;

    const [updated] = await tx
      .update(beerTypes)
      .set({ currentStock: sql`${beerTypes.currentStock} + ${quantity}` })
      .where(and(eq(beerTypes.id, beerTypeId), eq(beerTypes.clubId, ctx.club.id)))
      .returning({ currentStock: beerTypes.currentStock });
    if (!updated) throw new Error('recordRestock: update failed');

    await tx.insert(stockChanges).values({
      clubId: ctx.club.id,
      beerTypeId,
      delta: quantity,
      kind: 'restock',
      reason: reason?.trim() || null,
      createdByUserId: ctx.user.id,
    });

    revalidateStockViews();
    return { ok: true, newStock: updated.currentStock } as const;
  });
}

const adjustmentSchema = z.object({
  beerTypeId: z.string().uuid(),
  delta: z.number().int(),
  reason: z.string().trim().min(1).max(500),
});

export async function recordStockAdjustmentAction(
  rawInput: unknown,
): Promise<StockChangeResult> {
  const ctx = await requireRole('stock_manager', 'club_admin');
  const parsed = adjustmentSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, code: 'INVALID_INPUT' };
  const { beerTypeId, delta, reason } = parsed.data;
  if (delta === 0) return { ok: false, code: 'INVALID_INPUT' };

  return db.transaction(async (tx) => {
    const beer = await tx.query.beerTypes.findFirst({
      where: and(eq(beerTypes.id, beerTypeId), eq(beerTypes.clubId, ctx.club.id)),
    });
    if (!beer) return { ok: false, code: 'NOT_FOUND' } as const;

    // Atomic guard: the update matches only if it stays non-negative.
    // Spec 027 defence-in-depth — also scope by club_id (the read
    // above already did; carrying it through prevents a future read
    // refactor from accidentally widening the write surface).
    const [updated] = await tx
      .update(beerTypes)
      .set({ currentStock: sql`${beerTypes.currentStock} + ${delta}` })
      .where(
        and(
          eq(beerTypes.id, beerTypeId),
          eq(beerTypes.clubId, ctx.club.id),
          sql`${beerTypes.currentStock} + ${delta} >= 0`,
        ),
      )
      .returning({ currentStock: beerTypes.currentStock });
    if (!updated) return { ok: false, code: 'WOULD_GO_NEGATIVE' } as const;

    await tx.insert(stockChanges).values({
      clubId: ctx.club.id,
      beerTypeId,
      delta,
      kind: 'adjustment',
      reason,
      createdByUserId: ctx.user.id,
    });

    revalidateStockViews();
    return { ok: true, newStock: updated.currentStock } as const;
  });
}

export type DeleteStockChangeResult =
  | { ok: true }
  | { ok: false; code: 'NOT_FOUND' };

/**
 * Remove a single row from a beer's stock-movement history (admin data
 * reset). The stock ledger is normally append-only, but an admin cleaning
 * fake/test entries from a fresh club's history needs to tidy it.
 *
 * Safe re: totals: currentStock is a STORED counter (not derived from this
 * ledger), so deleting an audit row does NOT change the stock count — it
 * only removes the history line. Nothing FKs to stock_changes, so it's a
 * plain single delete. club_admin only, club-scoped.
 */
export async function deleteStockChangeAction(rawId: unknown): Promise<DeleteStockChangeResult> {
  const ctx = await requireRole('club_admin');
  const parsed = z.string().uuid().safeParse(rawId);
  if (!parsed.success) return { ok: false, code: 'NOT_FOUND' };
  const stockChangeId = parsed.data;

  const row = await db.query.stockChanges.findFirst({
    where: and(eq(stockChanges.id, stockChangeId), eq(stockChanges.clubId, ctx.club.id)),
  });
  if (!row) return { ok: false, code: 'NOT_FOUND' };

  await db.delete(stockChanges).where(eq(stockChanges.id, stockChangeId));

  revalidateStockViews();
  revalidatePath(`/admin/beer-types/${row.beerTypeId}/history`);
  return { ok: true };
}

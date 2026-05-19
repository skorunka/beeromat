# Contract: Stock & Beer Type Catalog

**Feature**: `001-beer-consumption-ledger` | **Phase**: 1 — Design

Server actions and queries for managing the beer-type catalog and stock levels (US 7, P2).

---

## `SA` `createBeerType({ name, unitPriceMinor, initialStock, lowStockThreshold, displayOrder? }) → { beerTypeId }`

Add a new beer to the catalog.

**Input**:
```ts
z.object({
  name: z.string().trim().min(1).max(120),
  unitPriceMinor: z.bigint().positive(),
  initialStock: z.number().int().nonnegative(),
  lowStockThreshold: z.number().int().nonnegative(),
  displayOrder: z.number().int().optional(),
});
```

**Output**: `{ beerTypeId: string }`.

**Behaviour** (transaction):
1. `requireRole('stock_manager', 'club_admin')`.
2. Verify no active beer_type exists in the same club with the same `name` (case-insensitive). Else `DUPLICATE_NAME`.
3. Insert `beer_types`. If `displayOrder` omitted → set to `max(display_order) + 10` (gaps for easy reordering).
4. If `initialStock > 0`: insert `stock_changes` row (`kind = 'restock'`, `delta = initialStock`, `reason = 'initial stock'`).

**Errors**: `DUPLICATE_NAME`, `FORBIDDEN`.

**Role**: stock_manager or club_admin. FR-011, FR-013.

**Related FR**: FR-025.

---

## `SA` `updateBeerType({ id, patch }) → { ok }`

Edit name, price, low-stock threshold, or display order.

**Input**:
```ts
z.object({
  id: z.string().uuid(),
  patch: z.object({
    name: z.string().trim().min(1).max(120).optional(),
    unitPriceMinor: z.bigint().positive().optional(),
    lowStockThreshold: z.number().int().nonnegative().optional(),
    displayOrder: z.number().int().optional(),
  }),
});
```

**Output**: `{ ok: true }`.

**Behaviour**: standard `UPDATE` of the matched fields, scoped to club.

**Important**: changing `unitPriceMinor` does **NOT** retroactively change past consumptions — their `unit_price_minor_snapshot` is immutable. Only future consumptions use the new price.

**Errors**: `NOT_FOUND`, `DUPLICATE_NAME`, `FORBIDDEN`.

**Role**: stock_manager or club_admin.

---

## `SA` `archiveBeerType({ id }) → { ok }` / `unarchiveBeerType({ id }) → { ok }`

Soft-archive a beer type (preserves history, hides from log-screen pick list).

**Input**: `z.object({ id: z.string().uuid() })`.

**Output**: `{ ok: true }`.

**Behaviour**: `UPDATE beer_types SET is_archived = true|false`. No restocking allowed on archived types; consumption logging blocked at the catalog query level.

**Role**: stock_manager or club_admin.

---

## `SA` `recordRestock({ beerTypeId, quantity, reason? }) → { ok, newStock }`

A delivery arrived.

**Input**:
```ts
z.object({
  beerTypeId: z.string().uuid(),
  quantity: z.number().int().positive(),
  reason: z.string().max(500).optional(),
});
```

**Output**: `{ ok: true, newStock: number }`.

**Behaviour** (transaction):
1. `requireRole('stock_manager', 'club_admin')`.
2. Verify beer type exists, in club, and not archived. Else `NOT_FOUND` or `ARCHIVED`.
3. `UPDATE beer_types SET current_stock = current_stock + $quantity WHERE id = $1` RETURNING `current_stock`.
4. Insert `stock_changes` (`kind = 'restock'`, `delta = +quantity`, `reason`).

**Errors**: `NOT_FOUND`, `ARCHIVED`, `FORBIDDEN`.

**Role**: stock_manager or club_admin. FR-028.

---

## `SA` `recordStockAdjustment({ beerTypeId, delta, reason }) → { ok, newStock }`

Inventory correction (positive or negative). `reason` is mandatory.

**Input**:
```ts
z.object({
  beerTypeId: z.string().uuid(),
  delta: z.number().int(),                  // may be negative
  reason: z.string().trim().min(1).max(500),
});
```

**Output**: `{ ok: true, newStock: number }`.

**Behaviour** (transaction):
1. `requireRole('stock_manager', 'club_admin')`.
2. Atomic update with check: `UPDATE beer_types SET current_stock = current_stock + $delta WHERE id = $1 AND current_stock + $delta >= 0 RETURNING current_stock;`. 0 rows → `WOULD_GO_NEGATIVE`.
3. Insert `stock_changes` (`kind = 'adjustment'`, `delta`, `reason`).

**Errors**: `WOULD_GO_NEGATIVE`, `NOT_FOUND`, `FORBIDDEN`.

**Role**: stock_manager or club_admin. FR-029.

---

## `Q` `getBeerTypeCatalog({ includeArchived? }) → BeerType[]`

For both the log-screen pick list (`includeArchived = false`) and the stock-management admin view (`includeArchived = true`).

```ts
type BeerType = {
  id: string,
  name: string,
  unitPriceMinor: bigint,
  currentStock: number,
  lowStockThreshold: number,
  isLowStock: boolean,
  isOutOfStock: boolean,
  isArchived: boolean,
  displayOrder: number,
};
```

Sort: `displayOrder ASC, name ASC`.

**Role**: any member for non-archived; stock_manager/admin for archived view.

---

## `Q` `getStockHistory({ beerTypeId?, limit, cursor? }) → StockChangeRow[]`

Audit log of every stock change.

```ts
type StockChangeRow = {
  id: string,
  beerTypeId: string,
  beerTypeName: string,
  delta: number,
  kind: 'restock' | 'adjustment' | 'consumption_decrement' | 'consumption_void_increment',
  reason: string | null,
  createdAt: Date,
  createdByUserId: string,
  createdByDisplayName: string,
};
```

**Role**: stock_manager, treasurer, or club_admin.

**Use cases**:
- "Why does stock disagree with what we ordered?" — filter by `kind = 'adjustment'`.
- "How much Pilsner did we sell last month?" — sum `consumption_decrement` deltas over a date range.

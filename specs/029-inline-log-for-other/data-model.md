# Phase 1 Data Model: Inline "Log for Someone Else" on Home

**No schema change. No new persisted entity.** Reuses existing data + the existing on-behalf write path.

## Inputs (existing, unchanged)

### MemberOption (existing type, `components/picker/types.ts`)

The on-behalf target candidates, from `listOtherActiveMembers(clubId, memberId)`:

| Field | Role |
|-------|------|
| `id` | Target member id sent to the log action. |
| `displayName` | Shown in the member dropdown + success toast. |
| `avatarKey`, `avatarUploadAt` | Avatar in the dropdown. |

### Beer option (home in-stock catalog, existing)

From the home page's `inStockCatalog` projection (`getBeerTypeCatalog` filtered to in-stock, non-archived):

| Field | Role |
|-------|------|
| `id` | Beer id sent to the log action. |
| `name` | Shown in the beer dropdown + success toast. |
| `unitPriceMinor` | Shown beside the name in the dropdown. |
| `currentStock` | Disables out-of-stock options. |

## Derived / transient state (client)

### HomeLogForOther local state

```text
{
  expanded: boolean      // collapsed affordance vs expanded control
  memberId: string       // '' until chosen
  beerId: string         // '' until chosen
  isPending: boolean      // log in flight (from useTransition)
}
```

No persistence; selections live only for the session on the page.

## Write path (existing)

`logBeerOnBehalfAction({ beerTypeId, targetMemberId })` — unchanged. Returns `{ ok: true, ... }` or a typed failure (`TARGET_IS_SELF` / `TARGET_NOT_IN_CLUB` / `OUT_OF_STOCK` / `BEER_NOT_AVAILABLE`). Server re-validates club membership, self-target, and stock. The control maps failures to toasts.

## Invariants

- The control never sends a log with an empty member or beer (Log disabled until both set).
- The action is the sole writer — server-side validation is authoritative; the client picks are conveniences.
- No new data is read on the log path; only `router.refresh()` re-derives the home view.

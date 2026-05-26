# Quickstart — verifying spec 017

Five-minute path to confirm the home redesign + one-tap log works.

## Prerequisites

- Local Docker stack up: `pnpm docker:up`.
- Dev server running: `pnpm dev` (port 3010).
- At least one club + member seeded; ideally with a previous
  consumption row already.

## Verification path

### 1. Returning-member happy path

1. Open `http://localhost:3010` while signed in as a member who has
   logged at least one beer before.
2. Confirm the home page renders:
   - Friendly greeting in your active locale.
   - Balance sentence reading "Tvoje útrata: X Kč" (or
     "Your tab: CZK X") if owing, or "Vyrovnáno" / "All square"
     if square. **Verify no "dlužíš" anywhere on screen.**
   - A big primary button labelled "Zapiš [last beer]" with a
     beer-glass icon.
   - A small "Vyber jiné pivo →" link below it.
   - If owing: a smaller "Vyrovnat útratu" CTA further down.
3. Tap the primary button **once**.
4. Confirm: sonner toast appears in the bottom-right (or platform
   default) with "Zapsáno · útrata X Kč", and the balance sentence
   on the page updates without a full navigation.

### 2. First-time-logger path

1. Sign in as a freshly invited member who has never logged a beer.
2. Open `/`.
3. The primary button reads "Zapiš pivo" (generic) and tapping it
   navigates to `/log` (no toast, no server action — it's a link).

### 3. Archived-beer fallback

1. As admin, archive the beer type that one of the members last
   logged (`/admin/beer-types` → toggle archived).
2. Sign in as that member.
3. Open `/`. The primary button reads "Zapiš pivo" (generic), not
   the archived name.

### 4. Out-of-stock disabled state

1. As admin, set the `currentStock` of a beer to 0 (`/admin/beer-types`
   → restock with negative quantity, or adjust to 0).
2. Sign in as a member whose last log was that beer.
3. Open `/`. The primary button is disabled, labelled "[Beer name]
   — nedostupné", with a "Vyber jiné pivo →" link beneath it
   that's the only enabled affordance.

### 5. Failure path

1. Kill Docker (`docker stop beeromat-postgres`).
2. Open `/` and tap the primary button.
3. The toast surfaces a Czech/English error in the active locale,
   and the balance sentence does NOT change.
4. Re-start Docker; the next tap works normally.

## Verification gates (constitution v1.10.0)

```bash
pnpm test:unit            # green (no new unit tests here, just regression)
pnpm test:integration     # green; new last-beer-for-member spec included
pnpm test:component       # green; new HomeOneTapLog variants covered
pnpm build                # green
pnpm i18n:check           # green; new home.* keys in both catalogs
pnpm forms:check          # green; no native validation introduced
# pnpm test:e2e           # N/A — see plan.md test layer declaration
```

## Manual nag-tone audit (gate from contracts/home-page.md)

```bash
grep -rE "dlu(žíš|žná|žit)|you owe|you must pay" messages/ app/[locale]/\(app\)/ 2>&1
# Expected output: empty.
```

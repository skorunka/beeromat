# UI Contract — `/` home page (post spec 017)

This contract enumerates the render variants the new home page MUST
produce. It is the source of truth the component tests will assert
against.

## Inputs the page consumes

From the existing `requireUnlocked()` session context:
- `ctx.member.displayName` — string, used in the greeting.
- `ctx.member.id` — UUID, used in queries.
- `ctx.club.name` — string, displayed in the AppHeader (already
  shipped) and not on the home page itself.
- `ctx.club.currencyCode` — ISO 4217, used by `formatMoney`.
- `ctx.club.defaultLocale` — `'cs'` | `'en'`, used by `formatMoney`
  and by next-intl's `getTranslations`.

From new query `lastBeerForMember(ctx.member.id, ctx.club.id)`:
- `null`, OR
- `{ id, name, currentStock, isArchived, unitPriceMinor }`.

From existing `memberBalance(ctx.member.id)`:
- `bigint` in minor units (e.g. `380n` for 3,80 Kč… wait, 380n for
  380 Kč given CZK has no minor units in practice).

## Render variants

### V1 — Returning member, last beer active and in stock, owing balance

Inputs:
- Last beer: `{ name: "Pilsner", currentStock: 42, isArchived: false }`
- Balance: `38000n` minor → "380 Kč" formatted

Rendered DOM (semantic):

```
<main>
  greeting: "Ahoj, Tereza 👋"                          (link to /account, same as today)
  balance sentence: "Tvoje útrata: 380 Kč"             (no "dlužíš")
  ── HomeOneTapLog ──
    primary button: enabled, text "Zapiš Pilsner",     ← THE one-tap CTA
                    icon: beer-glass, h-14, w-full
    secondary link: "Vyber jiné pivo →" → /log
  ── settle CTA ──
    secondary link: "Vyrovnat útratu" → /settle        (smaller than the log button)
</main>
```

### V2 — Returning member, last beer active and in stock, square balance

Same as V1 except:
- Balance sentence: "Vyrovnáno" (no number, no settle CTA).
- No settle link rendered at all.

### V3 — First-time logger (no consumption history)

Inputs:
- Last beer: `null`
- Balance: `0n` (must be 0, since they've never logged)

Rendered DOM:

```
<main>
  greeting: "Ahoj, Pavel 👋"
  balance sentence: "Vyrovnáno"
  ── HomeOneTapLog ──
    primary button: link styled like a button, text "Zapiš pivo",
                    href: /log, icon: beer-glass, h-14, w-full
    (no secondary link below; the button itself is the picker entry point)
  (no settle CTA)
</main>
```

### V4 — Returning member, last beer archived

Inputs:
- Last beer: `{ name: "Old IPA", currentStock: 30, isArchived: true }`
- Balance: any

Rendered DOM:
- Same as V3 — falls back to generic "Zapiš pivo" linking to `/log`.
- Archived beers are never surfaced by name as the predictive default.

### V5 — Returning member, last beer active but out of stock

Inputs:
- Last beer: `{ name: "Pilsner", currentStock: 0, isArchived: false }`
- Balance: any

Rendered DOM:

```
<main>
  greeting
  balance sentence
  ── HomeOneTapLog ──
    primary button: DISABLED, text "Pilsner — nedostupné",
                    icon: beer-glass dimmed, h-14, w-full
    secondary link: "Vyber jiné pivo →" → /log        (now the only path forward)
  ── settle CTA ── (if owing)
</main>
```

### V6 — Tap in flight (transient state)

Triggered by tapping the V1 button:
- Button: disabled, text unchanged but with a pending visual (spinner
  or aria-busy="true").
- No navigation.
- After server action resolves:
  - Success → sonner toast "Zapsáno · útrata 420 Kč" (catalog
    string with current balance formatted in); `router.refresh()`
    triggers a re-render with the new balance.
  - Failure → sonner toast in destructive variant with the
    catalog error message; balance NOT updated.

## Strings the catalog must provide

Czech (`cs.json`) — under `home.*`:

| Key | Value |
|-----|-------|
| `home.balanceOwed` | `"Tvoje útrata: {amount}"` |
| `home.balanceSquare` | `"Vyrovnáno"` |
| `home.oneTapLog` | `"Zapiš {beer}"` |
| `home.oneTapLogGeneric` | `"Zapiš pivo"` |
| `home.oneTapLogUnavailable` | `"{beer} — nedostupné"` |
| `home.pickAnother` | `"Vyber jiné pivo →"` |
| `home.settleCta` | `"Vyrovnat útratu"` |
| `home.toastLogged` | `"Zapsáno · útrata {balance}"` |
| `home.toastError` | `"Pivo se nepodařilo zapsat. Zkus to znovu."` |
| `home.greeting` | `"Ahoj, {name} 👋"` (existing key, may already cover) |

English (`en.json`) — parallel keys, no nag tone either:

| Key | Value |
|-----|-------|
| `home.balanceOwed` | `"Your tab: {amount}"` |
| `home.balanceSquare` | `"All square"` |
| `home.oneTapLog` | `"Log a {beer}"` |
| `home.oneTapLogGeneric` | `"Log a beer"` |
| `home.oneTapLogUnavailable` | `"{beer} — out of stock"` |
| `home.pickAnother` | `"Pick a different beer →"` |
| `home.settleCta` | `"Settle up"` |
| `home.toastLogged` | `"Logged · tab {balance}"` |
| `home.toastError` | `"Couldn't log that. Try again."` |
| `home.greeting` | `"Hi {name} 👋"` |

Existing `home.title`, `home.outstandingBalance`, `home.settleUp`,
`home.allSquare` keys may become unused after this spec ships; the
implementation task list (`/speckit-tasks`) will reconcile.

## Acceptance gates

A passing implementation MUST:

1. Render exactly the structure above for each of V1–V6 (component
   tests).
2. Survive `pnpm i18n:check` — every new string resolves in both
   catalogs.
3. Survive `pnpm forms:check` — no native validation attributes
   introduced (this spec doesn't add a form, but the gate runs
   on the changed files anyway).
4. Contain zero literal occurrences of `dlužíš`, `dlužná`,
   `dlužit` (or English equivalents implying accusation) in
   `messages/cs.json`, `messages/en.json`, or anywhere under
   `app/[locale]/(app)/`. Grep-verifiable.

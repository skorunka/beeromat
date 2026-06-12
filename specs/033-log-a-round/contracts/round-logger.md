# Contract: `RoundLogger` component (evolves `HomeLogForOther`)

**Location**: `components/home/round-logger.tsx` (renamed from
`home-log-for-other.tsx`). Rendered inside the home Útrata card, directly under
the one-tap log, only when the round roster has at least the logger (always) and,
in practice, other members too.

## Props

```ts
interface RoundLoggerProps {
  /** Active club roster INCLUDING the logger, logger flagged + sorted first. */
  members: (MemberOption & { isSelf: boolean })[];
  beers: BeerPickerOption[];        // in-stock, non-archived catalogue
  defaultBeerTypeId: string | null; // the logger's usual/last beer (pre-fill)
  currencyCode: string;
  locale: string;
}
```

## Behaviour

- **Collapsed** (default): a compact affordance (icon + label) matching the
  spec-029 inline pattern, so it doesn't compete with the one-tap self-log.
- **Expanded**:
  - A **default beer** picker (`BeerPickerDropdown`), pre-selected to
    `defaultBeerTypeId`.
  - An **avatar toggle grid** of `members` (`MemberAvatar`); the `isSelf` tile is
    **pre-selected**. Tapping a tile toggles membership in the round; selected
    tiles show a ring + check.
  - A live **count**: "🍺 ×N" reflecting the number of selected drinkers, and the
    submit label "Zapsat rundu · N piv" (ICU plural).
  - **Per-person override** (US2): each selected tile carries a small beer chip
    showing its current beer (round default unless overridden); tapping the chip
    opens a `BeerPickerDropdown` for that drinker; clearing reverts to default.
  - **Submit** disabled when 0 drinkers selected OR no default beer chosen and
    any drinker lacks an override.
- **Submit** → builds `items` and calls `logRoundAction`:
  - `ok:true` with no `skipped` → `celebrateBeer()`, success toast
    "Runda zapsána · N piv 🍺", `router.refresh()`, **reset selection** (back to
    just the pre-selected logger + default beer) for the next round; stay on home.
  - `ok:true` with `skipped` → celebrate + a toast that names the skipped
    drinker(s)/beer(s) ("…, ale {names} nezbylo — došlo {beer}"), refresh, reset.
  - `ok:false code 'ALL_SKIPPED'` → error toast ("Rundu se nepodařilo zapsat —
    pivo došlo"), no celebrate, no reset.
  - `ok:false code 'EMPTY'` → not reachable from the UI (submit disabled); generic
    error toast as a seatbelt.

## i18n keys (new, under `round.*`)

`title`, `ctaLink` (collapsed affordance), `collapse`, `defaultBeerHint`,
`drinkersHint`, `count` (ICU plural "{count, plural, …}"),
`submitCta` (ICU plural with count), `overrideHint`, `clearOverride`,
`toastLogged` (plural), `toastLoggedPartial` (names skipped), `toastAllSkipped`,
`toastError`. `cs` + `en` parity enforced by `i18n:check`.

## Accessibility

- Each avatar toggle is a `button` with `aria-pressed` reflecting selection and an
  accessible name = the member's display name (+ "(ty)" for self).
- The count + submit label are text, not only colour, so the round size is
  legible without relying on the ring state.

## Out of scope (component)

- No quantity stepper (one beer per drinker per round).
- No whole-round undo control — undo/reject is per-beer via the existing tab undo
  + "logged for you" review.

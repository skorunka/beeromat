# Quickstart: Inline "Log for Someone Else" on Home

## What it does

On home, "Log for someone else" expands inline into a member dropdown + a beer dropdown + a Log button. Logging happens on the home page with no reload; the round breakdown refreshes in place and your selections persist so logging a table's round is a couple of taps.

## Manual walkthrough (dev)

1. Ensure the club has ≥2 active members and some in-stock beers.
2. On home, tap "Log for someone else" → the control expands (no navigation).
3. Pick a member (avatar dropdown), pick a beer (beer dropdown) → tap Log.
4. A 🍻 toast confirms "Logged {beer} for {member}"; the home breakdown updates in place; the pickers stay set.
5. Change just the member → tap Log again → second beer logged, still on home.
6. Tap the collapse toggle → back to the compact affordance.
7. Out-of-stock: a beer at 0 stock shows disabled in the dropdown; if it goes out of stock before you tap Log, an error toast appears and nothing is logged.
8. Solo club (no other active members): the affordance is absent.
9. `/log/for` still works as a deep link (unchanged tile-grid version).

## Verify

```bash
pnpm test:component tests/component/beer-picker-dropdown.spec.tsx
pnpm test:component tests/component/home-log-for-other.spec.tsx
pnpm i18n:check
pnpm build
```

## Notes

- Reuses `logBeerOnBehalfAction` (server-validated) + `listOtherActiveMembers` + the home catalog. No schema change.
- `router.refresh()` re-renders the server home so spec 028's breakdown reflects the new beer without a full reload.

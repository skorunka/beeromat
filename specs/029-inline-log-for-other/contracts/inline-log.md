# Contract: Inline "Log for Someone Else" on Home

## Component: `BeerPickerDropdown`

**Location**: `components/picker/beer-picker-dropdown.tsx`

**Props**:
```text
{
  beers: { id: string; name: string; unitPriceMinor: bigint; currentStock: number }[];
  value: string | null;
  onChange: (beerId: string | null) => void;
  currencyCode: string;
  locale: string;
  placeholder: string;
  ariaLabel: string;
  className?: string;
}
```

**Behaviour**:
- Trigger: Beer icon + selected beer name (or `placeholder`) + chevron; h-12 tap target.
- Content: radio group; each option "{name}" left + formatted price right; `min-h-12` items.
- Out-of-stock beers (`currentStock <= 0`) render disabled (non-selectable).
- Selecting an option calls `onChange(id)` and closes; the trigger reflects the new value.

**Component test cases**:
1. Trigger shows the placeholder when `value` is null.
2. Opening shows one option per beer with its formatted price.
3. An out-of-stock beer's option is disabled.
4. Selecting an option fires `onChange` with that beer id.
5. Trigger shows the selected beer's name when `value` is set.

## Component: `HomeLogForOther`

**Location**: `components/home/home-log-for-other.tsx`

**Props**:
```text
{
  members: MemberOption[];
  beers: { id; name; unitPriceMinor; currentStock }[];
  currencyCode: string;
  locale: string;
}
```
(Rendered by the home page only when `members.length > 0`.)

**Behaviour**:
- Collapsed: a "log for someone else" button/affordance.
- Tap → expand: `MemberPickerDropdown` + `BeerPickerDropdown` + Log button + a collapse toggle.
- Log disabled until both member + beer chosen, and while pending.
- Log → `logBeerOnBehalfAction({ beerTypeId, targetMemberId })`:
  - ok → `celebrateBeer()`, success toast `log.onBehalf.toastLogged {beer, member}`, `router.refresh()`, keep expanded + keep selections.
  - `TARGET_IS_SELF` → `errors.targetSelf` toast; `TARGET_NOT_IN_CLUB` → `errors.targetNotInClub`; else `toastError`. Nothing logged; selections preserved.

**Component test cases**:
1. Renders collapsed affordance; expands on tap (member + beer dropdowns + Log appear).
2. Log disabled until both member and beer chosen.
3. Tap Log dispatches `logBeerOnBehalfAction` with the chosen `{ beerTypeId, targetMemberId }`.
4. Success: success toast shown; selections still set (control still expanded).
5. Typed failure: error toast; action not treated as success; selections preserved.
6. Collapse toggle returns to the compact affordance.

## Home wiring: `/app/[locale]/(app)/page.tsx`

- Add `listOtherActiveMembers(ctx.club.id, ctx.member.id)` to the page's data load.
- Replace `<LogForOtherLink hasOtherMembers={...} />` with:
  `{otherMembers.length > 0 ? <HomeLogForOther members={otherMembers} beers={inStockCatalog} currencyCode={...} locale={...} /> : null}`
- Remove the now-unused `LogForOtherLink` import (and its component file — only home used it).

## i18n keys (cs + en)

- Reuse: `log.onBehalf.ctaLink` (collapsed label), `log.onBehalf.memberHint`, `log.onBehalf.toastLogged`, `log.onBehalf.toastError`, `log.onBehalf.errors.targetSelf`, `log.onBehalf.errors.targetNotInClub`.
- Add (if needed): `log.onBehalf.beerHint` (beer dropdown placeholder), `log.onBehalf.logCta` (short Log button label), `log.onBehalf.collapse` (collapse aria/label).

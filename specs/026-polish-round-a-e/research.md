# Research: Post-Shipping Polish Round (A-E)

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-05-27

All clarify decisions resolved upfront in spec.md
Clarifications section (Q1 → A two size variants, Q2 → α
keep home dropdown, Q3 → ⅰ `components/log/beer-tile.tsx`).
This file captures the audit-vs-reality reconciliation
and the test-strategy rationale.

## D1 — Audit item D was a false positive

**Finding**: The `/settle` page does NOT render the
treasurer's name anywhere. The page reads `t('payToClear',
{ amount })` ("Pošli {amount} a máš čisto." — Czech
imperative with no person attribution). The QR code and
Revolut button carry the bank details; no human name
surfaces on the page.

**Decision**: Drop US3 / D from this spec entirely.
Documented in `spec.md` near the top under "Scope
correction".

**Rationale**: Implementing US3 as-drafted would have
meant adding a treasurer-name element to the page that
doesn't exist today — that's a feature add, not a polish.
Out of scope for a polish round.

**Future**: If someone later wants the treasurer's face
on /settle as a recognition cue (legitimate UX
improvement), that's a fresh spec with its own user-story
justification — not bundled into a polish round.

## D2 — BeerTile shape

**Decision**: `BeerTile` is a thin styled-button wrapper
that accepts `{ beer, size, selected, onClick }` and
renders the appropriate variant. It does NOT carry any
async state, pending state, or action wiring — the
consumer owns that.

**Rationale**: Each call-site has different surrounding
state (transitions, error toasts, multi-step forms). A
fat tile component would force unnatural prop shapes for
each consumer. A thin tile + consumer-owned logic matches
the existing pattern of small primitive components in
the codebase.

## D3 — Auto tile on the bet-beer picker stays inline

**Decision**: In `RecordResultForm.tsx`, the "Auto · {beer}"
tile is NOT rendered as a `<BeerTile />`. It uses its own
inline `<button>` with the same selected-state styling.

**Rationale**: The Auto tile is a logical affordance, not
a beer — it represents "use server default" and has no
beer.id, no beer.unitPriceMinor. Trying to shoehorn it
into `BeerTile`'s `{ beer }` prop would either require
an optional/synthetic beer object (gross) OR a discriminant
prop (`mode: 'beer' | 'auto'`). Both are worse than the
trivial inline button. The visual consistency comes from
sharing the same className set, which is a copy-paste of
the BeerTile's selected/unselected classes — small DRY
loss, big shape clarity.

**Alternative considered**: Make `BeerTile` accept a
`mode` discriminant. Rejected as over-engineering.

## D4 — Home one-tap dropdown intentional difference

**Decision**: Add a clear documentation comment in
`home-one-tap-log.tsx` explaining the intentional choice.
Comment lives near the DropdownMenu render block.

**Rationale**: The home page has limited vertical space
between the AppHeader, the balance pill, and the bet-bet
awareness card. A beer-tile grid would push critical
content below the fold on a 360-wide phone. The dropdown
is the right shape for THAT surface. Documenting the
choice prevents a future fresh-eyes audit (like the one
that surfaced E today) from re-flagging it as an
inconsistency.

**Alternative considered**: Rework the home dropdown
items as small inline BeerTile rows inside the popup.
Rejected because:
- The home dropdown is keyboard-navigable + screen-reader-
  friendly via the existing DropdownMenuItem semantics.
  Tiles inside a popup would require re-implementing
  those affordances.
- The visual gain is marginal — the current item layout
  (`<Beer icon> name <price>`) already broadly matches
  the BeerTile aesthetic.

## D5 — Why no /settle component test

**Decision**: US3 dropped — no /settle test needed.

## D6 — Test scope

**Decision**: Three new/extended test files:

1. `tests/component/beer-tile.spec.tsx` (NEW) — covers
   both size variants, selected state, click, disabled.
2. `tests/component/on-behalf-review-banner.spec.tsx`
   (EXTEND) — add one assertion that the logger avatar
   renders inline before the logger name.
3. `tests/integration/on-behalf-review-avatar-fields.spec.ts`
   (NEW) — verify the extended query projects the three
   new avatar fields.

The existing `home-one-tap-log.spec.tsx` +
`record-result-form.spec.tsx` (spec 025) need NO change —
the BeerTile refactor preserves the button semantics
they depend on.

**Rationale**: Same pattern as spec 023 + 024 — test
the primitive once + extend existing surface tests
where behavior subtly changes. No new test surface
introduced.

# Feature Specification: Beer Buy-Price + Margin Tracking (v1.11)

**Feature Branch**: `011-beer-buy-price`

**Created**: 2026-05-24

**Status**: Shipped (2026-05-24)

**Input**: User description: "Add a buy-price field per beer type so the club can see how much they made on each beer (sell price minus buy price × units sold = club margin)."

The club buys beer at one price and sells to members at a higher
price; the margin is the treasurer's working capital — it pays for
the next case, snacks, or just lives as the club's piggy bank.
Today the app tracks only the sell price (`unit_price_minor`). The
treasurer has no way to see how much each beer earns or what total
margin sits in the till.

v1.11 closes that gap with the smallest possible change:

- Add `buy_price_minor` as a nullable column on `beer_types` (admin
  enters it when adding/editing a beer; existing rows have null
  until the admin fills them in).
- Render the buy-price field in the admin's beer-type form (next
  to the existing sell-price field, with the same money input
  pattern).
- Render per-beer margin on the existing `/admin/beer-types` list
  (sell − buy, when buy is set; "—" otherwise).
- Add a small "club margin" summary row at the top of the same
  page: total margin = Σ((sell − buy) × confirmed_consumption_count)
  across all beer types where buy is set.

Scope-tight: no new screens, no buy-price history per restock (a
restock-level snapshot is on the v1.12+ wishlist but adds complexity
disproportionate to v1.11's value), no margin export, no per-period
filtering. The treasurer eyeballs the number; that solves the "how
much did we make" question for v1.

## Personas *(mandatory — constitution v1.4.0)*

- **P4 — Treasurer (existing persona, name TBD by the club)**: the
  spec's primary user. They want to know "did we make money on
  beers this month" and currently have zero in-app signal.
- **P2 — Stock manager (existing persona)**: edits beer-type rows
  including the new buy-price field whenever a case arrives at a
  new price. Secondary user.
- **P1 — Standa, 67 · Stock manager · Czech only**: same persona
  as P2 above for this spec; he is the canary for the form's
  one-thumb friendliness — he must be able to type a buy price as
  comfortably as he types a sell price today.
- **Out-of-scope persona**: regular members (P3 etc.) never see
  the buy price or margin. This is an internal/treasury concern,
  hidden from the member-facing surfaces.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Stock manager enters buy price on a new beer (Priority: P1)

When adding a new beer type or editing an existing one, the admin
form shows TWO money fields: sell price (existing) and buy price
(new). Buy price is optional — leave blank if unknown — but if
filled, must be a positive money amount and less than or equal to
sell price (sell-below-buy is a configuration error worth flagging).

**Why this priority**: This IS the data entry path; without it the
margin column has no data.

**Independent Test**: Open the admin beer-types page as an admin.
Click "Add beer". Confirm a buy-price field exists alongside sell-
price. Submit with both filled. Confirm the new beer row's
`buy_price_minor` column reflects the entered value. Submit a
second beer without filling buy-price — confirm `buy_price_minor`
is null and the row persists fine.

**Acceptance Scenarios**:

1. **P2 (Stock manager, new beer with buy price)** — **Given** they open the new-beer form, **When** they enter sell `60.00`, buy `40.00`, and submit, **Then** the row persists with sell_price=6000 minor units AND buy_price=4000 minor units AND the row appears in the list with a visible margin column reading the sell-minus-buy value.
2. **P2 (Stock manager, new beer without buy price)** — **Given** they open the new-beer form, **When** they enter only sell `50.00` and submit, **Then** the row persists with buy_price=null AND the list shows "—" in the margin column for that row.
3. **P2 (Stock manager, edits existing beer to add buy price retroactively)** — **Given** an existing beer with sell=60.00 and buy=null, **When** they edit the beer and fill in buy=40.00, **Then** the row updates AND the margin column populates AND the club-margin summary at the top recomputes including this beer's margin contribution.
4. **P2 (Stock manager, sell-below-buy is rejected)** — **Given** they edit a beer, **When** they enter sell=30 and buy=50 and submit, **Then** an inline error reads "Cena za kus musí být alespoň nákupní cena" (or its English equivalent) AND no DB write happens.

---

### User Story 2 — Treasurer/admin sees club margin at a glance (Priority: P1)

The `/admin/beer-types` page renders a small summary row at the
top: "Klubový marže: X Kč" — the total margin across all beers
that have a buy price set, computed as Σ((sell − buy) × confirmed
consumption count) where consumption count means "rows in
consumptions table that are not voided".

**Why this priority**: This is the value delivery. US1 is the
data; US2 is the answer to the treasurer's actual question.

**Independent Test**: Seed three beers — two with buy-price set
(margin contributing), one without. Seed 5 consumptions of beer
A, 3 of beer B, 2 of beer C. Compute expected total margin
manually. Open the page as treasurer — confirm the summary row
displays the expected total in the club's currency.

**Acceptance Scenarios**:

1. **P4 (Treasurer, all beers have buy price)** — **Given** every beer in the club has a buy price set AND there are non-zero consumptions, **When** the treasurer opens `/admin/beer-types`, **Then** the summary row at the top displays a non-zero club margin formatted in the club's currency.
2. **P4 (Treasurer, mixed)** — **Given** half the beers have buy prices and half don't, **When** the treasurer opens the page, **Then** the summary row displays the margin contribution from ONLY the buy-priced beers AND a footnote indicates that "untracked" beers (without buy price) aren't included.
3. **P4 (Treasurer, fresh club with zero consumptions)** — **Given** beers exist but nobody has logged any beer yet, **When** the treasurer opens the page, **Then** the summary row reads "0,00 Kč" (or hides itself politely, implementation choice — but the page MUST NOT show a misleading negative or error).

---

### User Story 3 — Regular members never see margin (Priority: P1)

The new buy-price column and margin display are visible ONLY on
admin/treasurer surfaces. Regular members on `/log` (the daily
beer-logging screen) see only the sell price, exactly as today.

**Why this priority**: P1 same as the others because this is a
privacy/transparency contract — a member should not see what the
club paid for their beer.

**Independent Test**: Sign in as a regular `member`. Visit
`/log`. Confirm no buy-price or margin appears anywhere on the
page. The page is structurally identical to its pre-v1.11 state
for this persona.

**Acceptance Scenarios**:

1. **P3 (Tereza, regular member on the log screen)** — **Given** she is signed in as a `member`, **When** she opens `/log`, **Then** she sees beer names + sell prices + stock counts only — no buy price, no margin column, no "club margin" summary.

---

### Edge Cases

- **Buy price > sell price** → US1.4 rejects with inline error.
  Stops the configuration mistake at write time.
- **Buy price = 0** → allowed (someone donated a case). Margin
  computation treats this as 100% margin per unit. Not a bug.
- **Buy price set then cleared back to null** → margin column
  shows "—" again; summary recomputes without this beer's
  contribution.
- **Beer is archived** → not counted in club-margin summary
  regardless of buy price (archived beers shouldn't be in the
  active till math).
- **Consumption row is voided** → not counted. The margin sum
  uses non-voided consumption rows only.
- **Currency mismatch** (theoretical) — impossible by v1 schema
  (beer prices are stored in minor units of the single club's
  currency); v1.11 inherits that assumption.

## Requirements *(mandatory)*

### Functional Requirements

#### Schema

- **FR-001**: `beer_types` table MUST gain a nullable column `buy_price_minor` (bigint, minor units of the club's currency). Existing rows MUST migrate cleanly to null without manual intervention.
- **FR-002**: A CHECK constraint MUST enforce `buy_price_minor IS NULL OR buy_price_minor >= 0` (no negative buy prices).

#### Admin form

- **FR-003**: The existing beer-type create + edit forms MUST gain a "buy price" money input next to the existing "sell price" input. The buy field is OPTIONAL — empty submission persists as null.
- **FR-004**: If both prices are present at submit time, the system MUST validate `buy_price <= sell_price` and reject with an inline error otherwise.
- **FR-005**: The new field MUST follow the same money-input pattern as the sell-price field (parses both `,` and `.` decimals; same min-zero rule).

#### Treasurer view

- **FR-006**: The existing `/admin/beer-types` page MUST display a per-row "margin" column showing `(sell - buy)` formatted in the club's currency when buy is set; "—" otherwise.
- **FR-007**: The same page MUST display a top-of-page summary row showing the total club margin: `Σ((sell − buy) × non-voided consumption count)` across all NON-ARCHIVED beers where `buy_price_minor IS NOT NULL`.
- **FR-008**: The summary row MUST include a brief note when at least one beer type has `buy_price_minor IS NULL`, indicating that "untracked" beers aren't counted.

#### RBAC + visibility

- **FR-009**: The buy-price field MUST be visible ONLY to roles that can already access `/admin/beer-types` (today: `stock_manager` and `club_admin`). The margin column AND summary MUST be visible on the same page to the same roles, PLUS to `treasurer` (treasurer needs the margin view but does NOT need to edit catalog rows — out of scope to change beer-types page RBAC for v1.11; if treasurer cannot already access the page they will see margin via a separate read-only treasurer screen — implementation choice).
- **FR-010**: NO member-facing screen (`/log`, `/`, `/tab`, etc.) MUST display the buy price or margin.

#### i18n

- **FR-011**: New strings (label "Nákupní cena" / "Buy price", margin header, summary copy, footnote, validation error) MUST flow through next-intl under either the existing `admin.*` namespace or a new `margin.*` namespace, with cs+en parity. `pnpm i18n:check` MUST pass.

### Key Entities

- **`beer_types`**: existing entity, gains one nullable column `buy_price_minor` + one CHECK constraint. No other domain changes.
- **`consumptions`**: existing entity, unchanged. Read for the margin sum (filter: NOT voided, JOIN beer_types ON buy_price_minor IS NOT NULL).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A treasurer can see the club's total beer margin in under 5 seconds from app launch (sign in → /admin/beer-types). One screen, one number.
- **SC-002**: 100% of admin beer-type writes accept buy_price as optional (no validation regression on existing flow when buy is empty).
- **SC-003**: Sell-below-buy submissions are rejected with an inline error 100% of the time at the action layer, verified by unit test.
- **SC-004**: Margin column shows the correct value for every beer with buy set; "—" for null. Verified by E2E.
- **SC-005**: The top summary row shows the correct sum across the club's beers, verified by an integration test that seeds known sells/buys/consumptions and asserts the rendered value matches Σ((sell−buy)×count).
- **SC-006**: NO member-facing route renders the buy price or margin — verified by an E2E that signs in as a `member` and asserts neither the column header nor the summary copy appears on /log.
- **SC-007**: i18n parity — all new keys in both catalogs; `pnpm i18n:check` passes.

## Assumptions

- **Margin is computed across ALL TIME**, not per-period. v1.11 shows lifetime club margin. Period filtering (this month, last quarter) is a future spec.
- **Margin uses CURRENT prices** for every consumption row, NOT historical prices per consumption. The consumption row already snapshots the sell price (`unit_price_minor_snapshot`) but does NOT snapshot the buy price. Recomputing with current sell + buy is acceptable for v1 because (a) the buy price snapshot would require a schema migration on consumptions; (b) the treasurer's question is "how much have we made TODAY at TODAY's prices", not "what's the historical margin curve". A future spec may add buy snapshots if the lifetime number proves misleading.
- **Per-restock buy price** is out of scope. The buy price is a property of the beer TYPE, not of each individual delivery. Real-world buy prices fluctuate; v1.11 accepts that the displayed margin is approximate and trusts the treasurer to keep the type's buy_price reasonably current.
- **Currency formatting** uses the existing `formatMoney` helper. No new formatting concern.
- **No alerts / notifications** when margin drops below zero (it shouldn't unless somebody mis-typed). The inline sell-below-buy check at write time is the protection.

### Out of Scope (explicitly)

- Per-restock buy price snapshots (separate spec — adds a new table + audit machinery).
- Historical margin chart / per-period filter (separate spec — adds reporting infrastructure).
- Export to CSV / accounting integration (separate spec).
- Showing buy price OR margin on any member-facing screen (privacy contract).
- Backfilling existing beer types with a default buy price (admin enters them manually when ready).
- Alerts when margin trends negative (no observability infra for that in v1).

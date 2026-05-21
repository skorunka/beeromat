# Phase 1 — Data Model: UX Hardening (v1.1)

**No data-model changes.**

v1.1 is a presentation-and-navigation feature (FR-016). It introduces no
tables, columns, enums, indexes, or migrations, and it changes no
balance/payment/stock/bet-transfer calculation. The data model is exactly
that of feature `001-beer-consumption-ledger` (`specs/001-beer-consumption-ledger/data-model.md`).

The capabilities v1.1 touches already exist in the data and action layers:

| v1.1 story | Existing data/action it re-presents |
|---|---|
| US4 — undo a confirmation | `payments` status machine + `payment_state_transitions`; `voidConfirmedPaymentAction` (confirmed → voided). |
| US5 — forgot PIN | `device_sessions` (the PIN), `verification` (magic-link tokens); `requestMagicLinkAction`. |
| US3 — pending-row restructure | `payments` claims via `getPendingClaimsForTreasurer` — read path unchanged. |
| US6 — bet no-session guidance | `drink_sessions` open-session check — read path unchanged. |
| US1/US2/US7/US8 | Pure UI/routing — no data access change. |

**Non-data state introduced by v1.1** (for completeness, not a DB concern):
the `i18n` message catalogs (`messages/cs.json`, `messages/en.json`) are
expanded — these are static build-time assets, not persisted data.

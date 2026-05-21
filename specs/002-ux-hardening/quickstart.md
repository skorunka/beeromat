# Quickstart — Verifying UX Hardening (v1.1)

How to exercise and verify the `002-ux-hardening` feature locally. Assumes the
v1 dev environment is already set up (Docker stack up, `.env.local` present,
dev DB migrated + seeded — see `specs/001-beer-consumption-ledger/quickstart.md`).

## Run the gates

```bash
pnpm typecheck      # gate 1
pnpm lint           # gate 2
pnpm test:unit      # gate 3
pnpm build          # gate 4
pnpm test:e2e       # gate 5
pnpm i18n:check     # gate 6 — NEW in v1.1
```

All six must pass. `i18n:check` is the v1.1-defining gate: it fails on a
hardcoded user-facing string or on `cs`/`en` catalog key divergence.

## Manual walkthrough (the persona scenarios)

Start the dev server (`pnpm dev`) and, signed in as the seeded admin:

1. **Language (US1)** — visit `/cs` then `/en`; every screen — log, tab,
   settle, bet, history, treasurer pending, admin — renders fully in that
   language with no leftover English on the Czech UI.
2. **Touch targets (US2)** — open dev-tools device mode at 360×640; the
   beer-types and treasurer-pending action buttons are comfortably
   thumb-sized.
3. **Pending row (US3)** — on `/admin/pending`, a claim's amount and member
   name read first; Confirm and Dispute are clearly separated.
4. **Undo a confirmation (US4)** — confirm a payment, then undo it with a
   reason; the member's balance returns to its prior value.
5. **Forgot PIN (US5)** — on the PIN unlock screen choose "Forgot PIN";
   a sign-in email lands in Mailpit (`http://localhost:18025`); no PIN
   attempts were spent.
6. **Bet next-step (US6)** — with no open session, `/bet` explains how to
   start one and links to `/log`.
7. **Navigation (US7)** — the bottom nav reaches every daily screen in one
   tap; `/admin` lists members, banking, and beer-types.
8. **Loading (US8)** — throttle the network in dev-tools; each navigation
   shows a skeleton immediately.

## E2E

```bash
pnpm exec playwright test us2-          # the v1.1 (002) story specs
```

Every Acceptance Scenario in `spec.md` has a matching Playwright assertion;
each scenario names the persona it serves.

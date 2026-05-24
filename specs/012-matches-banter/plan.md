# Implementation Plan: Matches + Banter (v1.12)

**Branch**: `012-matches-banter` | **Date**: 2026-05-24 | **Spec**: [spec.md](./spec.md)

## Summary

New `matches` table (winner_member_id, loser_member_id, played_at, club_id, audit columns + void columns) for the singles-only v1.12. A new `/match` route with an opponent picker + "I won / I lost" buttons; the action opens one transaction that inserts the matches row AND N `bet_transfers` rows from loser → winner for the most-recent beer-of-the-session (fallback: cheapest active beer). 5-minute undo window invokes a compensating `voidMatchAction` that soft-deletes both the matches row and the bet_transfers. New `clubs.match_loser_beer_count` column (default 1) edited via /admin/config. Bottom-nav grows a Match tab. Funny copy + Trophy/Beer/Frown icons baked into the catalogs from day one.

## Technical Context

**Stack**: same as spec 011 (TypeScript 6.0, Next.js 16, Drizzle 0.45, react-hook-form 7 + zodResolver, lucide-react, shadcn).

**Storage**: new `matches` table + one new `clubs` column (`match_loser_beer_count`). Reuses existing `bet_transfers` + `bet_transfer_voids` schemas verbatim. ONE migration (0005).

**Testing**: Vitest unit (PGlite + `vi.mock('@/lib/db/client')` per spec 008/011 pattern) + Playwright E2E.

**Performance goals**: log-a-match action under 300ms p95 (one transaction, ~3 inserts); /match render under 1.5s FCP on mobile.

## Constitution Check

- **I Mobile-First PWA** — ✅ one-thumb opponent picker + 2 buttons. The bottom-nav Match tab is reachable in one thumb-stretch.
- **II Tenant-Aware Schema** — ✅ matches.club_id mandatory, reused on every insert/query.
- **III Track, Don't Transact** — ✅ N/A.
- **IV Auth That Disappears** — ✅ `requireUnlocked()` gates /match same as /log /bet.
- **V Auditable History (No Hard Deletes)** — ✅ matches uses the same `voided_at` / `voided_by_user_id` / `void_reason` columns as the existing consumption + bet_transfer rows. Undo writes compensating events, never deletes. UI exposes the undo affordance per the v1.4.0 reversibility clause.
- **VI Free-Tier First** — ✅ no new infra.
- **VII Fresh Code Hygiene** — ✅ no version bumps.
- **User Input & Forms** — ✅ rh-form + zodResolver + catalog-key errors; opponent picker is a Select (no native validation).
- **i18n** — ✅ new `match.*` namespace, cs+en parity.

No Complexity Tracking entries.

## Project Structure

```text
drizzle/
└── 0005_*.sql              # NEW migration: matches table + clubs.match_loser_beer_count

lib/
├── db/schema/
│   ├── clubs.ts            # MODIFY: add match_loser_beer_count column
│   └── matches.ts          # NEW: matches table definition
├── db/queries/
│   ├── matches.ts          # NEW: logMatchTx, voidMatchTx helpers (pure tx logic)
│   └── catalog.ts          # MODIFY: helper for "loser's beer choice" pickup
└── validation/
    └── match.ts            # NEW: logMatchSchema

app/[locale]/(app)/
├── match/
│   ├── page.tsx            # NEW: opponent picker + I won / I lost
│   ├── MatchForm.tsx       # NEW: client component
│   └── actions.ts          # NEW: logMatchAction + voidMatchAction
└── (app layout)
    └── nav files            # MODIFY: add Match tab to bottom nav

app/[locale]/(app)/admin/config/
└── ClubConfigForm.tsx       # MODIFY: add match_loser_beer_count field

messages/
├── cs.json                  # MODIFY: add match.* namespace + nav.match
└── en.json                  # MODIFY: add match.* namespace + nav.match

tests/
├── unit/
│   ├── match-schema.spec.ts
│   └── match-tx.spec.ts      # tests logMatchTx + voidMatchTx PGlite
└── e2e/
    └── match.spec.ts         # US1 happy + undo + i18n parity assertion
```

## Tasks (sketch — full breakdown in tasks.md)

1. T001 [P] Generate migration (matches table + clubs column).
2. T002 [P] lib/db/schema/matches.ts.
3. T003 lib/db/schema/clubs.ts add column.
4. T004 lib/validation/match.ts.
5. T005 [P] messages/* — match.* namespace + nav.match.
6. T006 lib/db/queries/matches.ts (logMatchTx + voidMatchTx + pickLoserBeer).
7. T007 actions.ts (logMatchAction + voidMatchAction thin wrappers).
8. T008 MatchForm.tsx client component.
9. T009 /match/page.tsx server shell.
10. T010 Add Match tab to bottom nav.
11. T011 ClubConfigForm + admin-config action: match_loser_beer_count field.
12. T012 Unit: match-schema.spec.ts + match-tx.spec.ts.
13. T013 E2E: match.spec.ts (happy + undo + nav-tab-visible).
14. T014 Gates + commit + merge.

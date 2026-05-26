# Research — Home redesign + one-tap log-a-beer

Phase 0 output for spec 017. Three decisions resolved here; no
NEEDS CLARIFICATION markers carried forward.

## Decision 1 — Query shape for the "last beer" lookup

**Decision**: Fold the last-beer lookup into a new dedicated query
helper `lastBeerForMember(memberId, clubId)` rather than extending
the home-page query inline. Call it from the home page's existing
`requireUnlocked()` → balance flow.

**Rationale**:
- The query is non-trivial: it joins `consumptions` to `beer_types`,
  filters by `voidedAt IS NULL`, scopes by `clubId`, orders by
  `createdAt DESC`, limits to 1. Inlining would clutter
  `page.tsx`.
- A dedicated helper is integration-testable in isolation
  (`tests/integration/last-beer-for-member.spec.ts`). Embedding it
  in the page handler would push the test into the component layer
  with a real DB or into manual-only territory — both violate
  Principle VIII's "lowest layer that verifies".
- The helper joins `beer_types` once and returns the columns the
  component needs (`id`, `name`, `currentStock`, `isArchived`,
  `unitPriceMinor`) — no second round-trip. FR-011 is satisfied.

**Alternatives considered**:
- *Inline subquery on the home page*: rejected for testability +
  legibility reasons above.
- *Cache last-beer on the `members` table*: rejected — premature
  optimisation, denormalisation, and adds a write-path concern
  (every consumption insert would have to update the cache).
  The query is fast (member id + index on `consumptions.createdAt`
  is sub-millisecond on the expected scale).
- *Defer the lookup to a client-side fetch after first paint*:
  rejected — adds a network round-trip from the client AND a
  loading state on the most prominent UI element, both of which
  contradict the "one tap from cold open" goal.

## Decision 2 — Confirmation UI: toast vs. inline banner

**Decision**: Use sonner toast (already in the shadcn set,
2-second auto-dismiss) for success/failure feedback. The balance
sentence updates via `router.refresh()` after a successful log.

**Rationale**:
- Standa (P3) explicitly asked for visible confirmation — both
  toast AND balance update give him two independent cues.
- Sonner is already used elsewhere (`/log`, `/settle`, the match
  flows) — consistent feedback UX across the app.
- Inline banner alternatives (a "logged!" strip below the button)
  add layout shift, which makes the next tap target move under
  the thumb — bad on mobile.
- Toast auto-dismisses so it doesn't pile up in a session where
  someone logs five beers in a row.

**Alternatives considered**:
- *Optimistic UI update without toast*: rejected because Standa
  wouldn't see anything happen on slow networks and would re-tap.
- *Inline banner only*: rejected for layout-shift reasons above.
- *Modal confirmation*: rejected because it adds a second tap
  ("OK, dismiss") which defeats the one-tap goal.

## Decision 3 — Client-island scope

**Decision**: Make ONLY the new `HomeOneTapLog` button a client
component (`'use client'`). The balance sentence and the rest of
the home page stay server-rendered.

**Rationale**:
- The button needs interactivity (transition, toast, disabled
  state). Server Components can't do `onClick`.
- The balance sentence is computed server-side from
  `memberBalance(memberId)` — server-rendering is free.
- Smaller client islands = faster TTI, less hydration JS shipped
  to the phone.
- The router refresh pattern (`router.refresh()` from a Client
  Component after a server action) is the canonical Next.js
  approach for "re-render the server tree without navigation",
  which is exactly the requirement for the balance sentence
  updating after a tap.

**Alternatives considered**:
- *Make the whole page a Client Component*: rejected — needlessly
  ships the balance calculation + the layout JSX as JS. Loses
  React Server Components' code-on-server-only benefit.
- *Use a Server Action redirect instead of router.refresh()*:
  rejected — would navigate (even to the same URL), which feels
  like a screen flash. `router.refresh()` re-fetches the server
  tree silently.

## Cross-cutting confirmations

- **Constitution v1.10.0 Principle VIII**: integration + component
  layers are the right home for this spec. No E2E justified
  (no new server action, no new persistence path, no new
  multi-system seam). The test layer declaration in `plan.md`
  captures this.
- **No new dependencies**: sonner, lucide-react, react-hook-form,
  next-intl, Drizzle, Next.js — all present already.
- **No constitution bumps**: Tech Stack table unaffected.
- **No new env vars or secrets**: zero infra surface.

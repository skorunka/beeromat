# Quickstart: Post-Shipping Polish Round (A-E)

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-05-27

## Setup

1. Boot dev: `pnpm dev`.
2. Sign in to a club with ≥2 active beers + ≥2 members.

## US1 — BeerTile consistency check (A + C)

Navigate to each surface and confirm tile shape:

- `/log` — beer tiles are `h-32` cards with the beer name + a
  price line. Two columns on a 360-wide phone. Selecting
  (tap to log) fires the existing log action — no regression.
- `/log/for` — beer tiles below the member tile grid are
  `h-16` flush tiles with name only. Selected style same as
  /log's selected card (primary trio).
- Open a for-beer match agreement page where you can record
  the result. The bet-beer picker renders the Auto tile +
  one h-16 tile per catalog beer. Tap a beer tile → tap
  "Side A won" → confirm the bet transfer uses the picked
  beer (spec 025's behavior preserved).

## US2 — Home banner avatar (B)

1. As member A, log a beer on member B's behalf via /log/for.
2. Sign in as member B; open home.
3. Confirm the on-behalf review banner shows member A's
   avatar (inline size, h-5) before A's name in the message.
4. Tap "Vrátit" or "Nechat" → the existing action contracts
   are unchanged.

## US3 — Home one-tap dropdown intentional difference (E)

Read `components/home/home-one-tap-log.tsx`. Confirm a
clear comment near the DropdownMenu render explains why
the home picker uses a dropdown (vertical-space constraint
on the home surface). No behavior change.

## Edge / regression checks

- A member with no avatar (Standa-persona) shows the
  initials chip in the on-behalf banner — same fallback
  chain as everywhere else.
- /log catalog with one beer in stock — the single tile
  renders cleanly in the two-column grid (second column
  empty, no layout regression).
- /log/for with the new BeerTile — selected-state styling
  matches today's pre-026 behavior pixel-for-pixel.
- The match-result form's Auto tile stays inline (not a
  BeerTile) — its styling matches the surrounding tile
  variants but the layout is special (no beer.id).

## Done when

- All three surfaces use the shared `BeerTile` component
  (grep for inline beer-tile className duplication
  returns zero matches in app/* and components/log/*).
- The on-behalf review banner shows the logger avatar
  inline.
- The intentional-dropdown comment is in
  `home-one-tap-log.tsx`.
- `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm
  test:integration && pnpm test:component && pnpm
  i18n:check && pnpm forms:check && pnpm build` is
  green.

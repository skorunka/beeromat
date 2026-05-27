# Quickstart: Bet-Beer Tile Picker

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-05-27

Manual walkthrough after `/speckit-implement` finishes.

## Setup

1. Boot the dev server: `pnpm dev` (or `/dev` skill).
2. Sign in as a club member who plays matches.
3. Seed (or pick) a club where:
   - There are at least 2 in-stock active beers in the
     catalog (e.g. "Pilsner" + "Stout").
   - You have logged at least one beer recently (so
     `lastBeerForMember` returns something).
4. Create or open an open for-beer agreement where you can
   record the result (you're on one of the sides AND
   nobody has settled it yet).

## US1 — Always-visible tile grid

Navigate to `/match/[agreementId]` for that agreement.

**Expected**:

- Above the "Strana A vyhrála" / "Strana B vyhrála"
  buttons, a tile grid renders.
- The grid is NOT collapsed — there's no `<details>` /
  "Změnit pivo" disclosure.
- First tile reads "Auto · {your-last-beer}" (e.g.
  "Auto · Pilsner") and is visually selected
  (`bg-primary` styling matching `/log`'s selected
  beer tile).
- Subsequent tiles show each in-stock active catalog
  beer ("Stout", etc.), one per tile, unselected.

## US1 — Tap-to-pick override

- Tap "Stout".
- Stout becomes visually selected; the Auto tile deselects.
- Tap "Strana A vyhrála".
- A toast confirms the result was recorded.
- Open the winning side's `/tab` — confirm a Stout
  consumption from the loser landed there (the bet
  transfer carries Stout).

## US2 — Default flow (no override)

- Open a fresh agreement (cancel + recreate, or pick
  a different one).
- Don't tap any picker tile (Auto stays selected).
- Tap "Strana A vyhrála".
- Open the winning side's `/tab` — confirm the bet
  transfer carries the loser's last-beer (server-side
  auto-default; same behavior as before this spec).

## US3 — Out-of-stock / archived beers stay hidden

- Set one beer to `currentStock = 0` via the admin
  catalog (or seed it directly).
- Open a match-result form for that club.
- Confirm the zero-stock beer does NOT render as a
  tappable tile.
- Archive another beer.
- Confirm the archived beer also does NOT render.

## Edge / regression checks

- **No last-beer fallback**: log out, sign in as a
  brand-new member who has never logged a beer (or seed
  one). Open a match-result form where they can record.
  The Auto tile reads "Auto · Pivo" (cs) or "Auto · Beer"
  (en).
- **Picker hidden for not-for-beer agreements**: settle a
  not-for-beer match — the picker does NOT render; the
  "who won" buttons appear without it.
- **Picker hidden for non-recorders**: open the same
  agreement as a non-side member — the page either shows
  the recorded result OR hides the form entirely (the
  existing `viewerCanRecord` gate is unchanged).
- **Reverse window unchanged**: settle a match. Within
  5 minutes, tap "Vrátit" — the reverse still works
  end-to-end (no change to `reverseResultAction`).
- **Long beer name truncation**: seed a beer named
  "Pivovar Kout na Šumavě 12° světlý ležák" — the
  tile renders without breaking the row; text truncates
  with ellipsis.

## Done when

- The match-result form shows the always-visible tile
  grid on every for-beer agreement where the viewer can
  record.
- The Auto tile is pre-selected with the recorder's
  last-beer name (or fallback).
- Tapping a non-Auto tile + submit sends the override;
  tapping Auto + submit (or never touching the picker) +
  submit sends no override.
- `<details>` + `<select>` are gone from the form.
- `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm
  test:integration && pnpm test:component && pnpm
  i18n:check && pnpm forms:check && pnpm build` is
  green.

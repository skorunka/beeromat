# Quickstart: Leaderboards + player profiles

## What you're building

A read-only stats layer: a **Leaderboards** page (7 boards, all-time/season
toggle, podium + self-highlight) and a **player profile** (record, streaks,
nemesis/victim, best/jinx partner, beer aggregates, tab, playful fun-lines).

## Manual test (dev)

1. `pnpm db:reset:operational && pnpm db:seed:heavy` (the seed now also generates
   **doubles** matches — needed for partner stats).
2. `pnpm dev`, sign in, open **Žebříčky** (from the bottom nav / match hub).
   - Each board ranks members correctly; top 3 read as a podium; **your row** is
     highlighted/reachable even if you're mid-pack.
   - Toggle **all-time ↔ this season** → the time-based boards recompute (tab
     stays current).
   - The win-rate board excludes anyone under 10 matches and shows the note.
3. Tap a member → their **profile**: played/won/lost + ratio, current/best
   streak, nemesis + favourite victim (with H2H), best/jinx partner, beers/night,
   favourite beer, rounds poured, tab, and 1–2 **fun-lines**.
4. Open **your own** profile from /account. A low-history member shows graceful
   placeholders (no nemesis yet, etc.), not errors.

## Automated tests

```bash
pnpm test:unit          # stats-{streak,head-to-head,partners,beers-per-night,fun-lines}
pnpm test:integration   # leaderboards (ranking/voided/season/guard) + player-stats (incl doubles)
pnpm test:component     # leaderboard-board, scope-toggle, profile sections, fun-line
pnpm test               # all + i18n:check + forms:check
```

### Unit (primary)
- `currentWinStreak` / `bestWinStreak` over crafted W/L sequences.
- `pickNemesis` / `pickFavouriteVictim` incl. the min-games guard + tie-breaks.
- `pickBestPartner` / `pickJinxPartner` incl. guard.
- `beersPerNight` (incl. 0-sessions → null).
- `selectFunLines` — which lines qualify for crafted stats, correct params, and
  no line for a no-qualifying-stats member.

### Integration
- Each board ranks the seeded club correctly; **voided** consumptions /
  **reversed** matches don't count; the **90-day** season window changes results;
  the **win-rate guard** excludes small samples; everything is club-scoped.
- `getPlayerStats` returns correct aggregates + a **doubles** partner record.

### Component
- Board: podium for top-3, self-row highlight, empty state.
- Scope toggle reflects the active scope (link to `?scope=…`).
- Profile renders each section + a fun-line (cs + en, correct plural).

## Definition of done

- Gates 1–8 green (`typecheck`, `lint`, `test:unit`, `test:integration`,
  `test:component`, `build`, `i18n:check`, `forms:check`). No E2E (declared N/A).
- No schema change / migration.
- Leaderboards page loads fast on the heavy dataset (SQL-aggregated).
- Shipped to `main`; commits reference task IDs + `US#`.

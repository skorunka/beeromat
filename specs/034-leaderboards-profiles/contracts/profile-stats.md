# Contract: player stats (`lib/db/queries/player-stats.ts` + `lib/stats/*`)

## Query entry point

```ts
getPlayerStats(args: {
  clubId: string;
  memberId: string;
}): Promise<MemberStats>; // see data-model.md for MemberStats
```

Gathers, for one member (bounded sets — this is a single profile):
- match rows the member played (winner/loser, opponentId, playedAt, agreementId,
  format) — non-voided, non-reversed;
- doubles agreement sides for partner pairing;
- beer aggregates (total, distinct sessions, favourite beer, rounds poured);
- open bet debts (owes-most-to);
- current tab via `memberBalance`.

The query returns raw aggregates + the ordered match/opponent/partner rows; the
**selection** (nemesis, victim, best/jinx partner, streaks) is done by the pure
`lib/stats/*` functions so it's unit-tested without a DB.

## Pure functions (`lib/stats/`, infrastructure-free)

```ts
// streak.ts — results ordered oldest→newest; entry = { won: boolean }
currentWinStreak(results: { won: boolean }[]): number; // consecutive wins ending at the last
bestWinStreak(results: { won: boolean }[]): number;

// head-to-head.ts
type H2H = { opponentId: string; wins: number; losses: number };
pickNemesis(h2h: H2H[], minGames = 3): H2H | null;          // max losses, guarded
pickFavouriteVictim(h2h: H2H[], minGames = 3): H2H | null;  // max wins, guarded

// partners.ts
type Partner = { partnerId: string; wins: number; games: number };
pickBestPartner(p: Partner[], minGames = 3): Partner | null;  // max winRate
pickJinxPartner(p: Partner[], minGames = 3): Partner | null;  // min winRate

// beers-per-night.ts
beersPerNight(totalBeers: number, distinctSessions: number): number | null; // null if 0 sessions
```

## Rules

- All selectors return `null` below their min-games guard (FR-008) — the UI
  shows a friendly placeholder, never a broken/empty value.
- `winRatio` = `won / played`, `null` when `played === 0`.
- Tie-breaks are explicit + deterministic (documented per fn): more games, then
  `displayName`/id — so unit tests are stable.
- Every figure excludes voided consumptions + reversed/cancelled/voided matches.
- `getPlayerStats` is club-scoped; a member id outside the club → not-found at
  the page layer.

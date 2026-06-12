# Contract: leaderboard queries (`lib/db/queries/leaderboards.ts`)

## Shape

```ts
type BoardKey =
  | 'beers' | 'tab' | 'wins' | 'played' | 'winRate' | 'streak' | 'boughtForOthers';
type Scope = 'allTime' | 'season'; // season = rolling 90 days

interface BoardRow {
  memberId: string;
  displayName: string;
  avatarKey: string | null;
  avatarUploadAt: Date | null;
  value: number;       // tab value is minor units as number is lossy → use bigint for tab
  rank: number;        // dense rank, ties share, tie-break by displayName
}

interface Leaderboard {
  key: BoardKey;
  scope: Scope;
  rows: BoardRow[];        // top-N (default 20), desc by value
  viewerRow: BoardRow | null;
  thresholdNote: string | null;
}

// One entry point builds all boards for the page, concurrently.
getLeaderboards(args: {
  clubId: string;
  viewerMemberId: string;
  scope: Scope;
  topN?: number; // default 20
}): Promise<Leaderboard[]>;
```

## Per-board metric (all `club_id`-scoped, **active members only**, voided/reversed EXCLUDED)

| Board | Metric | Source | Scope filter |
|---|---|---|---|
| `beers` | count non-voided consumptions | `consumptions` ⟕ `consumption_voids IS NULL` | `created_at ≥ now-90d` |
| `tab` | current outstanding balance (desc) | `memberBalance` per member (or one aggregate) | **none** (current-state) |
| `wins` | count matches won | `matches` (winner=member, not voided) | `played_at ≥ now-90d` |
| `played` | count matches (winner or loser) | `matches` | `played_at ≥ now-90d` |
| `winRate` | won ÷ played, **min 10 played** | `matches` | `played_at ≥ now-90d` |
| `streak` | current consecutive wins | all matches → fold per member (D3) | window then fold |
| `boughtForOthers` | non-voided consumptions where `created_by`=member's user AND `member_id`≠member | `consumptions` | `created_at ≥ now-90d` |

## Rules

- Each board is **one aggregate query** (`GROUP BY member`), `ORDER BY value
  DESC` `LIMIT topN`. NO per-member loop. Boards run via `Promise.all`.
- `winRate` excludes members below the min-played guard from the board entirely;
  `thresholdNote` carries the guard for the UI caption.
- `viewerRow`: the viewing member's `{ value, rank }` even when outside top-N
  (one extra bounded lookup), so the UI can pin/highlight it.
- Ties: equal `value` ⇒ same `rank`; deterministic order by `displayName`.
- Empty/low data ⇒ `rows: []`, `viewerRow: null` (UI shows a friendly state).
- `streak` + `tab` may compute in app code from a bounded fetch (D2/D3) rather
  than a single SQL aggregate — still no per-member round-trips.

## Performance

- Target < ~1.5s for the whole page on the heavy dataset. Verified by an
  integration test asserting correct ranking on a seeded club (not a timing
  assert, but the query shape — single aggregate per board — is the guarantee).

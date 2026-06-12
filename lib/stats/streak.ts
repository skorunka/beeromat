// Spec 034 — pure win-streak primitives. Used by the streak leaderboard
// (per-member fold) and the player profile. Results are ordered
// oldest → newest; each entry only needs whether the member won.

export interface StreakResult {
  won: boolean;
}

/** Consecutive wins ending at the member's MOST RECENT match (0 if the last
 *  match was a loss, or there are no matches). */
export function currentWinStreak(results: StreakResult[]): number {
  let streak = 0;
  for (let i = results.length - 1; i >= 0; i--) {
    if (!results[i]!.won) break;
    streak++;
  }
  return streak;
}

/** Longest run of consecutive wins anywhere in the member's history. */
export function bestWinStreak(results: StreakResult[]): number {
  let best = 0;
  let run = 0;
  for (const r of results) {
    if (r.won) {
      run++;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best;
}

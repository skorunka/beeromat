// Spec 034 — pure beers-per-night average. Null when the member has no
// sessions (avoids divide-by-zero + a meaningless 0).

export function beersPerNight(totalBeers: number, distinctSessions: number): number | null {
  if (distinctSessions <= 0) return null;
  return Math.round((totalBeers / distinctSessions) * 10) / 10; // one decimal
}

// Spec 018 — split a total beer count across the pairs of the
// losing side. See research.md §2 for the rule:
//
//   - `count` is the total beers owed by the losing SIDE
//     (clubs.matchLoserBeerCount).
//   - `numPairs` is how many winner/loser pairs the match
//     resolves into (1 for singles; 2 for doubles with
//     straight or crossed pairing).
//   - Result: array of length numPairs. Entry i is the beer
//     count for the i-th pair (i=0 = the seat1 pair).
//   - Distribute base = floor(count / numPairs) to all pairs;
//     give the remainder one-by-one to pairs starting at seat1.
//
// Pure function, no DB access. Unit-tested in
// tests/unit/split-beer-count.spec.ts.

export function splitBeerCountAcrossPairs(count: number, numPairs: number): number[] {
  if (numPairs <= 0) return [];
  const base = Math.floor(count / numPairs);
  const extra = count % numPairs;
  return Array.from({ length: numPairs }, (_, i) => base + (i < extra ? 1 : 0));
}

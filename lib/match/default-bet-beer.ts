// Spec 018 — resolve the beer type used for the auto-created
// winner consumption when a "for beer" match settles. See
// research.md §1 for the rule:
//
//   1. Use the recorder's override if valid (active, in stock,
//      present in the catalog).
//   2. Otherwise the winner's last-logged beer (lastBeer prop)
//      if it is active and in stock.
//   3. Otherwise the cheapest in-stock non-archived beer in the
//      club's catalog.
//   4. Otherwise throw `NoBeerInStockError` — the
//      match-settlement transaction MUST roll back.
//
// Pure function. The caller is responsible for loading the
// catalog snapshot + the winner's last-beer + the override
// before calling this.

export interface BetBeerCandidate {
  id: string;
  name: string;
  currentStock: number;
  isArchived: boolean;
  unitPriceMinor: bigint;
}

export class NoBeerInStockError extends Error {
  constructor() {
    super('NoBeerInStockError: no active, in-stock beer available for bet settlement');
    this.name = 'NoBeerInStockError';
  }
}

function isEligible(beer: BetBeerCandidate | null | undefined): beer is BetBeerCandidate {
  return !!beer && !beer.isArchived && beer.currentStock > 0;
}

export function pickBetBeer(input: {
  override: string | undefined;
  lastBeer: BetBeerCandidate | null;
  catalog: BetBeerCandidate[];
}): BetBeerCandidate {
  // (1) Honor override if present in the catalog AND eligible.
  if (input.override) {
    const match = input.catalog.find((b) => b.id === input.override);
    if (isEligible(match)) return match;
    // Invalid override (not in catalog, archived, or out of stock) → fall through.
  }

  // (2) Winner's last-beer if eligible.
  if (isEligible(input.lastBeer)) return input.lastBeer;

  // (3) Cheapest in-stock non-archived beer.
  const eligible = input.catalog
    .filter(isEligible)
    .sort((a, b) => {
      // Sort by unitPriceMinor ascending (bigint-aware).
      if (a.unitPriceMinor < b.unitPriceMinor) return -1;
      if (a.unitPriceMinor > b.unitPriceMinor) return 1;
      return 0;
    });
  if (eligible.length > 0) return eligible[0]!;

  // (4) Nothing left.
  throw new NoBeerInStockError();
}

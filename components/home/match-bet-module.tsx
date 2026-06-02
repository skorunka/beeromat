import { BeerIouRow } from '@/components/match/beer-iou-row';
import type { BeerPickerOption } from '@/components/picker/beer-picker-dropdown';
import type { MemberBeerDebts } from '@/lib/db/queries/match-bet-debts';

// Spec 030 — home module showing the member's open beer-IOUs, both
// directions: "Dluží ti pivo — {x}" (owed to me) and "Dlužíš pivo — {x}"
// (I owe). Each row carries the deliver ("Předáno") control. Renders
// nothing when there are no open IOUs. Replaces the old auto-settled
// won/lost transfer summary.

interface MatchBetModuleProps {
  debts: MemberBeerDebts;
  beers: BeerPickerOption[];
  currencyCode: string;
  locale: string;
}

export function MatchBetModule({ debts, beers, currencyCode, locale }: MatchBetModuleProps) {
  if (debts.owedToMe.length === 0 && debts.iOwe.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {debts.owedToMe.map((d) => (
        <BeerIouRow
          key={d.debtId}
          debt={d}
          role="owed"
          beers={beers}
          currencyCode={currencyCode}
          locale={locale}
        />
      ))}
      {debts.iOwe.map((d) => (
        <BeerIouRow
          key={d.debtId}
          debt={d}
          role="owe"
          beers={beers}
          currencyCode={currencyCode}
          locale={locale}
        />
      ))}
    </div>
  );
}

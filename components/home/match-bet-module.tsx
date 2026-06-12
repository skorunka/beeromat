import { useTranslations } from 'next-intl';

import { BeerIouRow } from '@/components/match/beer-iou-row';
import type { BeerPickerOption } from '@/components/picker/beer-picker-dropdown';
import type { MemberBeerDebts } from '@/lib/db/queries/match-bet-debts';

// Spec 030 — home module showing the member's open beer-IOUs, both
// directions: "Dluží ti pivo — {x}" (owed to me) and "Dlužíš pivo — {x}"
// (I owe). Each row carries the deliver ("Předáno") control. Renders
// nothing when there are no open IOUs. Replaces the old auto-settled
// won/lost transfer summary. A "Piva k předání · N" header counts all
// open IOUs (both directions) at a glance — the per-row stale nudge
// generalized into one count badge.

interface MatchBetModuleProps {
  debts: MemberBeerDebts;
  beers: BeerPickerOption[];
  currencyCode: string;
  locale: string;
  now: Date;
}

export function MatchBetModule({ debts, beers, currencyCode, locale, now }: MatchBetModuleProps) {
  const t = useTranslations('matchBet');
  const count = debts.owedToMe.length + debts.iOwe.length;
  if (count === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-0.5">
        <h2 className="text-sm font-semibold">🍺 {t('iouHeading')}</h2>
        <span
          key={count}
          className="bg-primary/15 text-primary animate-count-pop inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold tabular-nums"
        >
          {count}
        </span>
      </div>
      {debts.owedToMe.map((d) => (
        <BeerIouRow
          key={d.debtId}
          debt={d}
          role="owed"
          beers={beers}
          currencyCode={currencyCode}
          locale={locale}
          now={now}
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
          now={now}
        />
      ))}
    </div>
  );
}

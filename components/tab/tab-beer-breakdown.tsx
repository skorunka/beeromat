import { useTranslations } from 'next-intl';
import { Dices } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { formatMoney } from '@/lib/format';
import type { BeerBreakdownGroup } from '@/lib/tab/group-beer-breakdown';

// Spec 028 — per-day, per-beer breakdown on home + /tab. Each tennis-
// and-beer evening is a day section headed by weekday + date; within
// it, "{beer} ×{count} · {subtotal}" lines. Lost-bet beers (paid but
// not drunk) are marked with a Dices icon + note. Renders nothing
// when there are no groups. Uses useTranslations (sync, testable).

interface TabBeerBreakdownProps {
  groups: BeerBreakdownGroup[];
  currencyCode: string;
  locale: string;
}

export function TabBeerBreakdown({ groups, currencyCode, locale }: TabBeerBreakdownProps) {
  const t = useTranslations('tab.breakdown');
  if (groups.length === 0) return null;

  const dayFmt = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'numeric',
  });

  // Chunk the (already day-desc-sorted) groups into day sections.
  const days: { dayKey: string; date: Date; groups: BeerBreakdownGroup[] }[] = [];
  for (const g of groups) {
    const last = days[days.length - 1];
    if (last && last.dayKey === g.dayKey) last.groups.push(g);
    else days.push({ dayKey: g.dayKey, date: g.representativeDate, groups: [g] });
  }

  return (
    <Card className="flex flex-col gap-4 p-4">
      <h2 className="text-sm font-semibold tracking-wide uppercase">{t('heading')}</h2>
      {days.map((day) => (
        <div key={day.dayKey} className="flex flex-col gap-1.5">
          <div className="text-muted-foreground text-xs font-medium capitalize">
            {dayFmt.format(day.date)}
          </div>
          {day.groups.map((g) => (
            <div
              key={`${g.dayKey}-${g.origin}-${g.beerTypeName}`}
              className="flex items-baseline justify-between gap-2"
            >
              <span className="inline-flex min-w-0 items-baseline gap-1.5">
                {g.origin === 'lost_bet' ? (
                  <Dices
                    className="text-muted-foreground h-3.5 w-3.5 shrink-0 self-center"
                    aria-hidden
                  />
                ) : null}
                <span className="min-w-0 truncate">
                  {g.beerTypeName} <span className="text-muted-foreground">×{g.count}</span>
                  {g.origin === 'lost_bet' ? (
                    <span className="text-muted-foreground text-xs"> · {t('lostBet')}</span>
                  ) : null}
                </span>
              </span>
              <span className="font-mono text-sm tabular-nums">
                {formatMoney(g.subtotalMinor, currencyCode, locale)}
              </span>
            </div>
          ))}
        </div>
      ))}
    </Card>
  );
}

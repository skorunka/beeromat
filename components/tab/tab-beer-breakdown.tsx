import { useTranslations } from 'next-intl';

import { Card } from '@/components/ui/card';
import { formatMoney } from '@/lib/format';
import type { BeerBreakdownGroup } from '@/lib/tab/group-beer-breakdown';

// Spec 028 — per-beer breakdown on /tab. Read-only summary above the
// chronological list: "{beer} ×{count} · {subtotal}", grouped by
// beer type (and day when the round spans multiple days). Renders
// nothing when there are no groups. Uses useTranslations (works in
// both server + client, like TabEntryRow) so it stays sync + testable.

interface TabBeerBreakdownProps {
  groups: BeerBreakdownGroup[];
  currencyCode: string;
  locale: string;
}

export function TabBeerBreakdown({ groups, currencyCode, locale }: TabBeerBreakdownProps) {
  const t = useTranslations('tab.breakdown');
  if (groups.length === 0) return null;

  // Per-day sub-headings only matter when the round spans >1 day.
  const multiDay = new Set(groups.map((g) => g.dayKey)).size > 1;
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  // Preserve the helper's sort (day desc, subtotal desc) while
  // chunking into day sections for the multi-day case.
  const days: { dayKey: string; date: Date; groups: BeerBreakdownGroup[] }[] = [];
  for (const g of groups) {
    const last = days[days.length - 1];
    if (last && last.dayKey === g.dayKey) last.groups.push(g);
    else days.push({ dayKey: g.dayKey, date: g.representativeDate, groups: [g] });
  }

  return (
    <Card className="mb-6 flex flex-col gap-3 p-4">
      <h2 className="text-sm font-semibold tracking-wide uppercase">{t('heading')}</h2>
      <div className="flex flex-col gap-3">
        {days.map((day) => (
          <div key={day.dayKey} className="flex flex-col gap-1">
            {multiDay ? (
              <div className="text-muted-foreground text-xs">{dateFmt.format(day.date)}</div>
            ) : null}
            {day.groups.map((g) => (
              <div
                key={`${g.dayKey}-${g.beerTypeName}`}
                className="flex items-baseline justify-between gap-2"
              >
                <span className="min-w-0 truncate">
                  {g.beerTypeName}{' '}
                  <span className="text-muted-foreground">×{g.count}</span>
                </span>
                <span className="font-mono text-sm tabular-nums">
                  {formatMoney(g.subtotalMinor, currencyCode, locale)}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Card>
  );
}

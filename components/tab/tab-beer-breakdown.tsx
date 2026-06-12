import { useTranslations } from 'next-intl';
import { Dices } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { formatMoney, formatRelativeDay, isSameDay } from '@/lib/format';
import { cn } from '@/lib/utils';
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
  /** Reference "now" for the today/yesterday labels + today highlight. */
  now?: Date;
  /**
   * 'card' (default) — self-contained Card with its own eyebrow + grand
   * total, used on /tab + /history.
   * 'bare' — just the day sections, no Card and no heading, so a parent
   * (the home Útrata card) can own the chrome and total.
   */
  variant?: 'card' | 'bare';
}

export function TabBeerBreakdown({
  groups,
  currencyCode,
  locale,
  now = new Date(),
  variant = 'card',
}: TabBeerBreakdownProps) {
  const t = useTranslations('tab.breakdown');
  const tc = useTranslations('common');
  if (groups.length === 0) return null;

  // Grand total across all groups — shown prominently in the heading
  // row so the amount to settle is the most visible thing on the card.
  const totalMinor = groups.reduce((acc, g) => acc + g.subtotalMinor, 0n);

  const relativeLabels = { today: tc('today'), yesterday: tc('yesterday') };

  // Chunk the (already day-desc-sorted) groups into day sections.
  const days: { dayKey: string; date: Date; groups: BeerBreakdownGroup[] }[] = [];
  for (const g of groups) {
    const last = days[days.length - 1];
    if (last && last.dayKey === g.dayKey) last.groups.push(g);
    else days.push({ dayKey: g.dayKey, date: g.representativeDate, groups: [g] });
  }

  const body = days.map((day) => {
        // Today's section gets a primary accent (left bar + tint + 🍺)
        // so "what I've had today" is the first thing the eye lands on
        // — the date alone doesn't tell you whether it's today.
        const today = isSameDay(day.date, now);
        return (
        <div
          key={day.dayKey}
          className={cn(
            'flex flex-col gap-1.5',
            today && 'border-primary bg-primary/5 -mx-2 rounded-lg border-l-2 px-2 py-1.5',
          )}
        >
          <div
            className={cn(
              'flex items-center gap-1 text-xs font-medium capitalize',
              today ? 'text-primary font-semibold' : 'text-muted-foreground',
            )}
          >
            {today ? <span aria-hidden>🍺</span> : null}
            {formatRelativeDay(day.date, now, locale, relativeLabels)}
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
        );
  });

  // 'bare' — host card (home Útrata) owns the eyebrow + total.
  if (variant === 'bare') {
    return <div className="flex flex-col gap-4">{body}</div>;
  }

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-wide uppercase">{t('heading')}</h2>
        <span className="text-2xl font-bold tabular-nums">
          {formatMoney(totalMinor, currencyCode, locale)}
        </span>
      </div>
      {body}
    </Card>
  );
}

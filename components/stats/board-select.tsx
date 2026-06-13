'use client';

import type { Route } from 'next';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';
import type { BoardKey, Scope } from '@/lib/stats/types';

// Spec 034 follow-up — the leaderboards switcher: ONE board shown at a time, picked
// from a horizontally-scrollable chip strip (emoji + label, active chip filled).
// Best-practice scrollable-tabs pattern (cf. Material UI scrollable tabs): the chips
// are individually-focusable Links (keyboard tabs through them, browser scrolls each
// into view), PLUS ◂ ▸ buttons for mouse/desktop that appear only when the strip
// overflows and disable+dim at each end. Active chip is auto-centered on load.
// Chips navigate via ?board= (+ ?scope=) — shareable; only the scroll chrome is client.

const BOARDS: { key: BoardKey; emoji: string }[] = [
  { key: 'beers', emoji: '🍺' },
  { key: 'tab', emoji: '💸' },
  { key: 'wins', emoji: '🏆' },
  { key: 'played', emoji: '🎾' },
  { key: 'winRate', emoji: '📈' },
  { key: 'streak', emoji: '🔥' },
  { key: 'boughtForOthers', emoji: '🤝' },
];

export function BoardSelect({ current, scope }: { current: BoardKey; scope: Scope }) {
  const t = useTranslations('stats');
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const measure = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 1);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    // ResizeObserver isn't in every env (e.g. jsdom under test) — feature-detect
    // it; the window resize listener is the fallback.
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    }
    return () => {
      el.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      ro?.disconnect();
    };
  }, [measure]);

  // Center the active chip on load / when the selected board changes.
  useEffect(() => {
    const active = scrollerRef.current?.querySelector('[data-active="true"]');
    // Optional-call the method too — jsdom (test env) doesn't implement it.
    active?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
  }, [current]);

  const nudge = (dir: -1 | 1) => {
    const el = scrollerRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  const overflowing = canLeft || canRight;
  const ARROW =
    'flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground transition-opacity disabled:pointer-events-none disabled:opacity-30';

  return (
    <div className="flex items-center gap-1">
      {overflowing ? (
        <button type="button" aria-label={t('scrollLeft')} onClick={() => nudge(-1)} disabled={!canLeft} className={ARROW}>
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
      ) : null}

      <div
        ref={scrollerRef}
        role="group"
        aria-label={t('boardSwitcher')}
        className="flex flex-1 gap-2 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {BOARDS.map((b) => {
          const active = b.key === current;
          const href = (
            scope === 'season'
              ? `/leaderboards?board=${b.key}&scope=season`
              : `/leaderboards?board=${b.key}`
          ) as Route;
          return (
            <Link
              key={b.key}
              href={href}
              data-active={active ? 'true' : undefined}
              aria-current={active ? 'true' : undefined}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
                active
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card border-border text-muted-foreground hover:text-foreground',
              )}
            >
              <span aria-hidden>{b.emoji}</span>
              {t(`board.${b.key}`)}
            </Link>
          );
        })}
      </div>

      {overflowing ? (
        <button type="button" aria-label={t('scrollRight')} onClick={() => nudge(1)} disabled={!canRight} className={ARROW}>
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

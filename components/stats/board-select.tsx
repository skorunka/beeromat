'use client';

import type { Route } from 'next';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useRouter } from '@/lib/i18n/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { BoardKey, Scope } from '@/lib/stats/types';

// Spec 034 follow-up — the leaderboards page shows ONE board at a time; this
// dropdown switches which. Mobile-first: a full-width tap target, finger-sized
// rows, a check on the current board. The board lives in ?board= (preserving
// ?scope=) so the URL stays shareable and the page stays server-rendered.

// Fixed v1 board set + emoji (labels via the stats.board.* catalog). Order
// mirrors the leaderboard-board BOARD map.
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
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const cur = BOARDS.find((b) => b.key === current) ?? BOARDS[0]!;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger className="border-input bg-card hover:bg-accent flex h-12 w-full items-center justify-between gap-2 rounded-lg border px-3 text-left">
        <span className="inline-flex min-w-0 items-center gap-2">
          <span className="text-lg" aria-hidden>
            {cur.emoji}
          </span>
          <span className="truncate text-base font-semibold">{t(`board.${cur.key}`)}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={4} className="min-w-(--anchor-width) p-1">
        <DropdownMenuRadioGroup
          value={current}
          onValueChange={(v) => {
            setOpen(false);
            const qs = new URLSearchParams();
            qs.set('board', v);
            if (scope === 'season') qs.set('scope', 'season');
            router.push(`/leaderboards?${qs.toString()}` as Route);
          }}
        >
          {BOARDS.map((b) => (
            <DropdownMenuRadioItem key={b.key} value={b.key} className="min-h-12 py-3 text-base">
              <span className="text-lg" aria-hidden>
                {b.emoji}
              </span>
              <span className="truncate">{t(`board.${b.key}`)}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

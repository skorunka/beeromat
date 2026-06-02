import type { Route } from 'next';
import { useTranslations } from 'next-intl';
import { Beer, Trophy } from 'lucide-react';

import { Link } from '@/lib/i18n/navigation';
import { Card } from '@/components/ui/card';

// Spec 018 + usability follow-up (2026-05-28) — home module showing
// the member's bet-linked beers in the past 24h, BOTH directions:
//   • lost  (betCount):  beers now on the member's tab (loser).
//   • won   (wonCount):  beers the loser is covering (winner) — gives
//                        the winner the same closure the loser gets.
// Renders nothing when both are 0. Each side's "reverse" affordance
// is a clearly-secondary muted link, not the primary content (the
// info is the point; reversing is the exception).

interface MatchBetModuleProps {
  betCount: number;
  sourceMatchIds: string[];
  wonCount: number;
  wonMatchIds: string[];
  /** Single member covering the won beer(s) — names them in the copy. */
  wonPayerName: string | null;
}

export function MatchBetModule({
  betCount,
  sourceMatchIds,
  wonCount,
  wonMatchIds,
  wonPayerName,
}: MatchBetModuleProps) {
  const t = useTranslations('home.matchBet');
  if (betCount === 0 && wonCount === 0) return null;

  return (
    <Card className="flex flex-col gap-3 p-4">
      {wonCount > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="text-sm leading-snug">
            <Trophy className="text-primary mr-1 inline-block h-4 w-4" aria-hidden />
            {wonPayerName
              ? t('wonPaidBy', { count: wonCount, name: wonPayerName })
              : t('won', { count: wonCount })}
          </p>
          <Link
            href={(wonMatchIds.length === 1 ? `/match/${wonMatchIds[0]}` : '/match') as Route}
            className="text-muted-foreground hover:text-foreground inline-flex min-h-9 items-center text-xs underline-offset-4 hover:underline"
          >
            {wonMatchIds.length === 1 ? t('viewOne') : t('viewMany')}
          </Link>
        </div>
      ) : null}

      {betCount > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="text-sm leading-snug">
            <Beer className="mr-1 inline-block h-4 w-4" aria-hidden />
            {sourceMatchIds.length === 1
              ? t('one', { count: betCount })
              : t('many', { count: betCount })}
          </p>
          <Link
            href={(sourceMatchIds.length === 1 ? `/match/${sourceMatchIds[0]}` : '/match') as Route}
            className="text-muted-foreground hover:text-foreground inline-flex min-h-9 items-center text-xs underline-offset-4 hover:underline"
          >
            {sourceMatchIds.length === 1 ? t('reverseOne') : t('reverseMany')}
          </Link>
        </div>
      ) : null}
    </Card>
  );
}

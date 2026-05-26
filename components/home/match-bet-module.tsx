import type { Route } from 'next';
import { useTranslations } from 'next-intl';
import { Beer } from 'lucide-react';

import { Link } from '@/lib/i18n/navigation';
import { Card } from '@/components/ui/card';

// Spec 018 — home module showing bet-linked consumptions for the
// active member in the past 24h. Renders nothing when betCount = 0.
// See contracts/home-module.md for the three variants.

interface MatchBetModuleProps {
  betCount: number;
  sourceMatchIds: string[];
}

export function MatchBetModule({ betCount, sourceMatchIds }: MatchBetModuleProps) {
  const t = useTranslations('home.matchBet');
  if (betCount === 0) return null;

  // V2 — single match.
  if (sourceMatchIds.length === 1) {
    const matchId = sourceMatchIds[0]!;
    return (
      <Card className="flex flex-col gap-2 p-4">
        <p className="text-sm leading-snug">
          <Beer className="mr-1 inline-block h-4 w-4" aria-hidden />
          {t('one', { count: betCount })}
        </p>
        <Link
          href={`/match/${matchId}` as Route}
          className="text-muted-foreground hover:text-foreground inline-flex min-h-9 items-center text-sm underline-offset-4 hover:underline"
        >
          {t('reverseOne')}
        </Link>
      </Card>
    );
  }

  // V3 — multiple matches aggregated.
  return (
    <Card className="flex flex-col gap-2 p-4">
      <p className="text-sm leading-snug">
        <Beer className="mr-1 inline-block h-4 w-4" aria-hidden />
        {t('many', { count: betCount })}
      </p>
      <Link
        href={'/match' as Route}
        className="text-muted-foreground hover:text-foreground inline-flex min-h-9 items-center text-sm underline-offset-4 hover:underline"
      >
        {t('reverseMany')}
      </Link>
    </Card>
  );
}

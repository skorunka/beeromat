import type { Route } from 'next';
import { useTranslations } from 'next-intl';
import { Swords } from 'lucide-react';

import { Link } from '@/lib/i18n/navigation';
import { Card } from '@/components/ui/card';

// Home prompt for OPEN match agreements the member is a participant
// in. Without this, a scheduled match is invisible on home until the
// member manually navigates to /match — so "record the result" had no
// presence on the main action surface (usability finding 2026-05-28).
// Renders nothing when the member has no open matches.

export interface OpenMatchSummary {
  id: string;
  sideA: string;
  sideB: string;
}

export function OpenMatchPrompt({ matches }: { matches: OpenMatchSummary[] }) {
  const t = useTranslations('home.openMatch');
  if (matches.length === 0) return null;

  // Single open match → name both sides + deep-link straight to it.
  if (matches.length === 1) {
    const m = matches[0]!;
    return (
      <Card className="border-primary/30 flex flex-col gap-2 p-4">
        <p className="text-sm font-medium leading-snug">
          <Swords className="text-primary mr-1 inline-block h-4 w-4" aria-hidden />
          {t('one', { sideA: m.sideA, sideB: m.sideB })}
        </p>
        <Link
          href={`/match/${m.id}` as Route}
          className="text-primary inline-flex min-h-9 items-center text-sm font-medium underline-offset-4 hover:underline"
        >
          {t('recordCta')}
        </Link>
      </Card>
    );
  }

  // Several open matches → aggregate + link to the hub.
  return (
    <Card className="border-primary/30 flex flex-col gap-2 p-4">
      <p className="text-sm font-medium leading-snug">
        <Swords className="text-primary mr-1 inline-block h-4 w-4" aria-hidden />
        {t('many', { count: matches.length })}
      </p>
      <Link
        href={'/match' as Route}
        className="text-primary inline-flex min-h-9 items-center text-sm font-medium underline-offset-4 hover:underline"
      >
        {t('goToMatches')}
      </Link>
    </Card>
  );
}

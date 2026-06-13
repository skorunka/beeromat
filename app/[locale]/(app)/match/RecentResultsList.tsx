import { Fragment } from 'react';
import type { Route } from 'next';
import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Link } from '@/lib/i18n/navigation';
import { Card } from '@/components/ui/card';
import { RepeatMatchButton } from '@/components/match/repeat-match-button';
import type { RecentResultSummary } from '@/lib/db/queries/match-agreements';

interface RecentResultsListProps {
  results: RecentResultSummary[];
}

type Seat = RecentResultSummary['sides']['A'][number];

// Spec 036 follow-up — each player's name links to their profile. The row
// used to be ONE big <Link> to the match (so per-player links would nest
// anchors). De-nested: names are profile links, and a trailing chevron is
// the match link. The repeat button (spec 027) is unchanged.
function LinkedSide({ seats, className }: { seats: Seat[]; className?: string }) {
  return (
    <>
      {seats.map((s, i) => (
        <Fragment key={s.memberId}>
          {i > 0 ? <span className="text-muted-foreground"> + </span> : null}
          <Link
            href={`/members/${s.memberId}` as Route}
            className={`underline-offset-2 hover:underline ${className ?? ''}`}
          >
            {s.displayName}
          </Link>
        </Fragment>
      ))}
    </>
  );
}

// Compact "recently played" list for the /match hub. Winner marked with 🏆 +
// bold; loser muted. Player names tap through to profiles; the chevron opens
// the recorded agreement; the repeat button clones it into a new open match.
export function RecentResultsList({ results }: RecentResultsListProps) {
  const t = useTranslations('match');
  return (
    <ul className="flex flex-col gap-2">
      {results.map((r) => {
        const loserSide = r.winningSide === 'A' ? 'B' : 'A';
        return (
          <li key={r.id}>
            <Card className="flex flex-row items-center gap-1 p-1.5 pr-2">
              <div className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5">
                <span aria-hidden className="shrink-0">
                  🏆
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  <LinkedSide seats={r.sides[r.winningSide]} className="font-semibold" />
                  <span className="text-muted-foreground"> · </span>
                  <LinkedSide seats={r.sides[loserSide]} className="text-muted-foreground" />
                </span>
              </div>
              <Link
                href={`/match/${r.id}` as Route}
                aria-label={t('viewMatchAria')}
                className="text-muted-foreground hover:text-foreground hover:bg-accent flex size-9 shrink-0 items-center justify-center rounded-md transition-colors"
              >
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Link>
              <RepeatMatchButton agreementId={r.id} />
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

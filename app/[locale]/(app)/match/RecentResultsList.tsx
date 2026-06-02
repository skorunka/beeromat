import { Link } from '@/lib/i18n/navigation';
import { Card } from '@/components/ui/card';
import { joinSideNames } from '@/lib/format/match-sides';
import type { RecentResultSummary } from '@/lib/db/queries/match-agreements';

interface RecentResultsListProps {
  results: RecentResultSummary[];
}

// Compact "recently played" list for the /match hub — so the match
// surface actually shows matches you've played, not just open ones.
// Winner marked with 🏆 + bold; loser muted (gender-neutral, no verb).
// Each row links to the recorded agreement detail.
export function RecentResultsList({ results }: RecentResultsListProps) {
  return (
    <ul className="flex flex-col gap-2">
      {results.map((r) => {
        const winner = joinSideNames(r.sides[r.winningSide]);
        const loser = joinSideNames(r.sides[r.winningSide === 'A' ? 'B' : 'A']);
        return (
          <li key={r.id}>
            <Link href={`/match/${r.id}`}>
              <Card className="hover:bg-accent flex flex-row items-center gap-2 p-3 transition-colors">
                <span aria-hidden className="shrink-0">
                  🏆
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  <span className="font-semibold">{winner}</span>
                  <span className="text-muted-foreground"> · {loser}</span>
                </span>
              </Card>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

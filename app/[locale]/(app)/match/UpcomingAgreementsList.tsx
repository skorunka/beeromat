import { getTranslations } from 'next-intl/server';

import { Link } from '@/lib/i18n/navigation';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { joinSideNames } from '@/lib/format/match-sides';
import type { OpenAgreementSummary } from '@/lib/db/queries/match-agreements';

interface UpcomingAgreementsListProps {
  agreements: OpenAgreementSummary[];
}

export async function UpcomingAgreementsList({ agreements }: UpcomingAgreementsListProps) {
  const t = await getTranslations('match');

  if (agreements.length === 0) {
    return <p className="text-muted-foreground py-6 text-center text-sm">{t('upcomingEmpty')}</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {agreements.map((a) => {
        const sideA = joinSideNames(a.sides.A);
        const sideB = joinSideNames(a.sides.B);
        return (
          <li key={a.id}>
            <Link href={`/match/${a.id}`}>
              <Card className="hover:bg-accent flex flex-col gap-2 p-4 transition-colors">
                <div className="text-base font-semibold">
                  {sideA} <span className="text-muted-foreground">vs</span> {sideB}
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="bg-secondary text-secondary-foreground rounded-full px-2 py-0.5">
                    {a.format === 'doubles' ? t('formatDoubles') : t('formatSingles')}
                  </span>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 font-medium',
                      a.forBeer
                        ? 'bg-primary/15 text-primary'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {a.forBeer ? t('chipForBeer') : t('chipFriendly')}
                  </span>
                </div>
              </Card>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

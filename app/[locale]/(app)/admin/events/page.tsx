import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Card } from '@/components/ui/card';
import { SeriesForm } from '@/components/events/series-form';
import { SeriesRow } from '@/components/events/series-row';
import { requireRole } from '@/lib/auth/session';
import { listSeries } from '@/lib/db/queries/events';

// Spec 032 US2/US3 — admin manages recurring series (create, edit,
// activate/deactivate). Deactivated series stay listed (dimmed) so they
// can be reactivated — the seasonal summer/winter switch.
export default async function AdminEventsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const ctx = await requireRole('club_admin');
  const t = await getTranslations('events.admin');
  const series = await listSeries(ctx.club.id);

  return (
    <main className="mx-auto max-w-md p-5">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('manageHint')}</p>
      </header>

      {series.length > 0 ? (
        <ul className="mb-6 flex flex-col gap-2">
          {series.map((s) => (
            <li key={s.id}>
              <SeriesRow
                series={{
                  id: s.id,
                  weekday: s.weekday,
                  startLocalTime: s.startLocalTime,
                  placeLabel: s.placeLabel,
                  title: s.title,
                  isActive: s.isActive === 1,
                }}
              />
            </li>
          ))}
        </ul>
      ) : null}

      <Card className="p-4">
        <h2 className="mb-3 text-lg font-semibold">{t('newSeries')}</h2>
        <SeriesForm />
      </Card>
    </main>
  );
}

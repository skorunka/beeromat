import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Card } from '@/components/ui/card';
import { SeriesForm } from '@/components/events/series-form';
import { DeactivateSeriesButton } from '@/components/events/deactivate-series-button';
import { requireRole } from '@/lib/auth/session';
import { listSeries } from '@/lib/db/queries/events';

// Spec 032 US2/US3 — admin manages recurring series.
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

  const weekdayFmt = new Intl.DateTimeFormat(ctx.club.defaultLocale, { weekday: 'long' });
  // 2024-01-01 is a Monday, so day-of-month == ISO weekday for 1..7.
  const weekdayLabel = (iso: number): string => {
    return weekdayFmt.format(new Date(2024, 0, iso));
  };

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
              <Card className="flex flex-row items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {weekdayLabel(s.weekday)} · {s.startLocalTime}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {s.title ? `${s.title} · ` : ''}
                    {s.placeLabel}
                    {s.isActive === 0 ? ' · ✕' : ''}
                  </div>
                </div>
                {s.isActive === 1 ? <DeactivateSeriesButton seriesId={s.id} /> : null}
              </Card>
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

import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n/navigation';
import type { Route } from 'next';
import { CalendarDays, Check, MapPin, X } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { requireUnlocked } from '@/lib/auth/session';
import { listOpenThisWeek } from '@/lib/db/queries/events';

// Spec 032 US1 — "this week" list of open sessions for the member.
export default async function EventsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const ctx = await requireUnlocked();
  const t = await getTranslations('events');
  const now = new Date();
  const rows = await listOpenThisWeek(ctx.club.id, ctx.member.id, now);

  const dateFmt = new Intl.DateTimeFormat(ctx.club.defaultLocale, {
    weekday: 'long',
    day: 'numeric',
    month: 'numeric',
  });
  const timeFmt = new Intl.DateTimeFormat(ctx.club.defaultLocale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Prague',
  });

  return (
    <main className="mx-auto max-w-md p-5">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">{t('thisWeek')}</h1>
      </header>

      {rows.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">{t('noSessions')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => {
            const [y, m, d] = r.occurrenceDate.split('-').map(Number) as [number, number, number];
            const dateLabel = dateFmt.format(new Date(y, m - 1, d, 12));
            return (
              <li key={r.occurrenceId}>
                <Link href={`/events/${r.occurrenceId}` as Route}>
                  <Card className="hover:bg-accent flex flex-row items-center gap-3 p-3 transition-colors">
                    <CalendarDays className="text-primary h-5 w-5 shrink-0" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">
                        {dateLabel} · {timeFmt.format(r.startsAt)}
                      </div>
                      <div className="text-muted-foreground flex items-center gap-1 text-xs">
                        <MapPin className="h-3.5 w-3.5" aria-hidden />
                        {r.title ?? r.placeLabel}
                        <span aria-hidden>·</span>
                        {t('goingCount', { count: r.goingCount })}
                      </div>
                    </div>
                    {r.myStatus === 'going' ? (
                      <Check className="text-primary h-5 w-5 shrink-0" aria-label={t('going')} />
                    ) : r.myStatus === 'not_going' ? (
                      <X className="text-destructive h-5 w-5 shrink-0" aria-label={t('notGoing')} />
                    ) : null}
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

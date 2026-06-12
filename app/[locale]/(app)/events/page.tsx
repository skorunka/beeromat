import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n/navigation';
import type { Route } from 'next';
import { CalendarDays, Check, MapPin, X } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { NextSessionCard } from '@/components/events/next-session-card';
import { requireUnlocked } from '@/lib/auth/session';
import { getOccurrenceDetail, listOpenThisWeek } from '@/lib/db/queries/events';
import { turnoutVibe, type TurnoutVibe } from '@/lib/events/window';

// Short format chip for the collapsed rows ('none' shows nothing — the
// headcount already says "nobody yet").
const FORMAT_KEY: Record<TurnoutVibe, string | null> = {
  none: null,
  solo: 'format.solo',
  single: 'format.single',
  threesome: 'format.threesome',
  doubles: 'format.doubles',
  fiver: 'format.fiver',
  crowd: 'format.crowd',
};

// Spec 032 US1 — upcoming open sessions for the member. The nearest one is
// expanded inline (RSVP without tapping through); the rest are compact links.
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
  // Roster for the nearest session powers its expanded who's-coming strip.
  const firstDetail = rows[0]
    ? await getOccurrenceDetail(rows[0].occurrenceId, ctx.club.id)
    : null;

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

  const fmtDate = (occurrenceDate: string) => {
    const [y, m, d] = occurrenceDate.split('-').map(Number) as [number, number, number];
    return dateFmt.format(new Date(y, m - 1, d, 12));
  };

  return (
    <main className="mx-auto max-w-md p-5">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">{t('upcoming')}</h1>
      </header>

      {rows.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">{t('noSessions')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r, i) => {
            const vibe = turnoutVibe(r.goingCount);

            // ── Nearest session: the shared featured card (same as home) ──
            if (i === 0) {
              // Going members, earliest opt-in first (matches the detail roster).
              const going =
                firstDetail?.roster.filter((m) => {
                  return m.status === 'going';
                }) ?? [];
              return (
                <li key={r.occurrenceId}>
                  <NextSessionCard
                    session={r}
                    going={going}
                    now={now}
                    locale={ctx.club.defaultLocale}
                  />
                </li>
              );
            }

            // ── Later sessions: compact link rows ──────────────────────
            const format = FORMAT_KEY[vibe];
            return (
              <li key={r.occurrenceId}>
                <Link href={`/events/${r.occurrenceId}` as Route}>
                  <Card className="hover:bg-accent flex flex-row items-center gap-3 p-3 transition-colors">
                    <CalendarDays className="text-primary h-5 w-5 shrink-0" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">
                        {fmtDate(r.occurrenceDate)} · {timeFmt.format(r.startsAt)}
                      </div>
                      <div className="text-muted-foreground flex items-center gap-1 text-xs">
                        <MapPin className="h-3.5 w-3.5" aria-hidden />
                        {r.title ?? r.placeLabel}
                        <span aria-hidden>·</span>
                        {t('goingCount', { count: r.goingCount })}
                        {format ? (
                          <>
                            <span aria-hidden>·</span>
                            <span className="text-primary/80">{t(format)}</span>
                          </>
                        ) : null}
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

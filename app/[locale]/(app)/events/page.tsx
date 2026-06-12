import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n/navigation';
import type { Route } from 'next';
import { CalendarDays, Check, MapPin, X } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { RsvpToggle } from '@/components/events/rsvp-toggle';
import { requireUnlocked } from '@/lib/auth/session';
import { avatarUploadUrl } from '@/lib/avatars/upload-url';
import { formatTimeAgo } from '@/lib/format';
import { getOccurrenceDetail, listOpenThisWeek } from '@/lib/db/queries/events';
import { turnoutVibe, type TurnoutVibe } from '@/lib/events/window';

// Playful tennis-math copy keyed by going-count. Typed maps so TS enforces
// every vibe has copy and the i18n checker never sees a template key.
const VIBE_KEY: Record<TurnoutVibe, string> = {
  none: 'vibe.none',
  solo: 'vibe.solo',
  single: 'vibe.single',
  threesome: 'vibe.threesome',
  doubles: 'vibe.doubles',
  fiver: 'vibe.fiver',
  crowd: 'vibe.crowd',
};
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

            // ── Nearest session: expanded inline card ──────────────────
            if (i === 0) {
              // Going members, earliest opt-in first (matches the detail roster).
              const going = (
                firstDetail?.roster.filter((m) => {
                  return m.status === 'going';
                }) ?? []
              ).sort((a, b) => {
                return (a.rsvpUpdatedAt?.getTime() ?? 0) - (b.rsvpUpdatedAt?.getTime() ?? 0);
              });
              return (
                <li key={r.occurrenceId}>
                  <Card className="border-primary/30 flex flex-col gap-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-lg font-semibold">
                          {fmtDate(r.occurrenceDate)} · {timeFmt.format(r.startsAt)}
                        </div>
                        <div className="text-muted-foreground flex items-center gap-1 text-xs">
                          <MapPin className="h-3.5 w-3.5" aria-hidden />
                          {r.title ?? r.placeLabel}
                        </div>
                      </div>
                      <Link
                        href={`/events/${r.occurrenceId}` as Route}
                        className="text-primary shrink-0 text-xs underline"
                      >
                        {t('detail')} →
                      </Link>
                    </div>

                    <p className="text-sm font-medium">
                      {t(VIBE_KEY[vibe], { count: r.goingCount })}
                    </p>

                    <RsvpToggle occurrenceId={r.occurrenceId} status={r.myStatus} />

                    {going.length > 0 ? (
                      <div className="flex items-center gap-2">
                        <span
                          key={r.goingCount}
                          className="animate-count-pop text-primary text-sm font-bold tabular-nums"
                        >
                          {t('goingCount', { count: r.goingCount })}
                        </span>
                        <div className="flex flex-wrap items-center gap-1">
                          {going.slice(0, 10).map((m) => (
                            <span
                              key={m.memberId}
                              title={
                                m.rsvpUpdatedAt
                                  ? `${m.displayName} · ${formatTimeAgo(m.rsvpUpdatedAt, now, ctx.club.defaultLocale)}`
                                  : m.displayName
                              }
                            >
                              <MemberAvatar
                                avatarKey={m.avatarKey}
                                displayName={m.displayName}
                                uploadUrl={avatarUploadUrl(m.memberId, m.avatarUploadAt)}
                                className="h-7 w-7"
                              />
                            </span>
                          ))}
                          {going.length > 10 ? (
                            <span className="text-muted-foreground text-xs">+{going.length - 10}</span>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </Card>
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

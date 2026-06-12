import type { Route } from 'next';
import { useTranslations } from 'next-intl';
import { CalendarDays, MapPin, Users } from 'lucide-react';

import { Link } from '@/lib/i18n/navigation';
import { Card } from '@/components/ui/card';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { RsvpToggle } from '@/components/events/rsvp-toggle';
import { avatarUploadUrl } from '@/lib/avatars/upload-url';
import { formatTimeAgo } from '@/lib/format';
import { turnoutVibe, type TurnoutVibe } from '@/lib/events/window';

// Spec 032 — the featured "nearest open session" card with one-tap RSVP.
// Single source of truth, used both on home and as the first (expanded)
// item on /events so the two never drift.

const VIBE_KEY: Record<TurnoutVibe, string> = {
  none: 'vibe.none',
  solo: 'vibe.solo',
  single: 'vibe.single',
  threesome: 'vibe.threesome',
  doubles: 'vibe.doubles',
  fiver: 'vibe.fiver',
  crowd: 'vibe.crowd',
};

export interface NextSessionData {
  occurrenceId: string;
  occurrenceDate: string;
  startsAt: Date;
  placeLabel: string;
  title: string | null;
  goingCount: number;
  myStatus: 'going' | 'not_going' | null;
}

export interface NextSessionGoing {
  memberId: string;
  displayName: string;
  avatarKey: string | null;
  avatarUploadAt: Date | null;
  rsvpUpdatedAt: Date | null;
}

export function NextSessionCard({
  session,
  going,
  now,
  locale,
}: {
  session: NextSessionData;
  going: NextSessionGoing[];
  now: Date;
  locale: string;
}) {
  const t = useTranslations('events');
  const vibe = turnoutVibe(session.goingCount);
  const [y, m, d] = session.occurrenceDate.split('-').map(Number) as [number, number, number];
  const dateLabel = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'numeric',
  }).format(new Date(y, m - 1, d, 12));
  const timeLabel = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Prague',
  }).format(session.startsAt);

  return (
    <Card className="border-primary/30 flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/events/${session.occurrenceId}` as Route} className="group min-w-0">
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
            <CalendarDays className="text-primary h-4 w-4" aria-hidden />
            {t('nextSession')}
          </div>
          <div className="mt-1 text-lg leading-tight font-semibold group-hover:underline">
            {dateLabel} · {timeLabel}
          </div>
          <div className="text-muted-foreground flex items-center gap-1 text-xs">
            <MapPin className="h-3.5 w-3.5" aria-hidden />
            {session.title ?? session.placeLabel}
          </div>
        </Link>
        <span
          key={session.goingCount}
          className="bg-primary/15 text-primary animate-count-pop inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-sm font-bold tabular-nums"
          title={t('goingCount', { count: session.goingCount })}
        >
          <Users className="h-4 w-4" aria-hidden />
          {session.goingCount}
        </span>
      </div>

      <p className="text-sm font-medium">{t(VIBE_KEY[vibe], { count: session.goingCount })}</p>

      <RsvpToggle occurrenceId={session.occurrenceId} status={session.myStatus} />

      {going.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1">
          {going.slice(0, 10).map((p) => (
            <span
              key={p.memberId}
              title={
                p.rsvpUpdatedAt
                  ? `${p.displayName} · ${formatTimeAgo(p.rsvpUpdatedAt, now, locale)}`
                  : p.displayName
              }
            >
              <MemberAvatar
                size="row"
                avatarKey={p.avatarKey}
                displayName={p.displayName}
                uploadUrl={avatarUploadUrl(p.memberId, p.avatarUploadAt)}
              />
            </span>
          ))}
          {going.length > 10 ? (
            <span className="text-muted-foreground text-xs">+{going.length - 10}</span>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

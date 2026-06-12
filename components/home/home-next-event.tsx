import type { Route } from 'next';
import { useTranslations } from 'next-intl';
import { CalendarDays, MapPin } from 'lucide-react';

import { Link } from '@/lib/i18n/navigation';
import { Card } from '@/components/ui/card';
import { RsvpToggle } from '@/components/events/rsvp-toggle';
import { turnoutVibe, type TurnoutVibe } from '@/lib/events/window';

// Spec 032 follow-up — surface the nearest open session on home (the
// screen members actually open), with one-tap RSVP. Renders nothing when
// there's no upcoming session in the rolling window.

const VIBE_KEY: Record<TurnoutVibe, string> = {
  none: 'vibe.none',
  solo: 'vibe.solo',
  single: 'vibe.single',
  threesome: 'vibe.threesome',
  doubles: 'vibe.doubles',
  fiver: 'vibe.fiver',
  crowd: 'vibe.crowd',
};

export interface HomeNextEventData {
  occurrenceId: string;
  occurrenceDate: string;
  startsAt: Date;
  placeLabel: string;
  title: string | null;
  goingCount: number;
  myStatus: 'going' | 'not_going' | null;
}

export function HomeNextEvent({
  event,
  locale,
}: {
  event: HomeNextEventData | null;
  locale: string;
}) {
  const t = useTranslations('events');
  if (!event) return null;

  const vibe = turnoutVibe(event.goingCount);
  const [y, m, d] = event.occurrenceDate.split('-').map(Number) as [number, number, number];
  const dateLabel = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'numeric',
  }).format(new Date(y, m - 1, d, 12));
  const timeLabel = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Prague',
  }).format(event.startsAt);

  return (
    <Card className="border-primary/30 flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
          <CalendarDays className="text-primary h-4 w-4" aria-hidden />
          {t('nextSession')}
        </span>
        <Link href={'/events' as Route} className="text-primary shrink-0 text-xs underline">
          {t('navLabel')} →
        </Link>
      </div>

      <div>
        <div className="text-lg font-semibold">
          {dateLabel} · {timeLabel}
        </div>
        <div className="text-muted-foreground flex items-center gap-1 text-xs">
          <MapPin className="h-3.5 w-3.5" aria-hidden />
          {event.title ?? event.placeLabel}
        </div>
      </div>

      <p className="text-sm font-medium">{t(VIBE_KEY[vibe], { count: event.goingCount })}</p>

      <RsvpToggle occurrenceId={event.occurrenceId} status={event.myStatus} />
    </Card>
  );
}

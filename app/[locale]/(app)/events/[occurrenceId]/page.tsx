import type { Route } from 'next';
import { Link } from '@/lib/i18n/navigation';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Beer, Check, X } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { RsvpToggle } from '@/components/events/rsvp-toggle';
import { AdminMemberRsvp } from '@/components/events/admin-member-rsvp';
import { CancelOccurrenceButton } from '@/components/events/cancel-occurrence-button';
import { requireUnlocked } from '@/lib/auth/session';
import { roleSatisfies } from '@/lib/permissions';
import { avatarUploadUrl } from '@/lib/avatars/upload-url';
import { getOccurrenceDetail } from '@/lib/db/queries/events';
import { isOccurrenceOpen, lowTurnoutKey } from '@/lib/events/window';

export default async function OccurrenceDetailPage({
  params,
}: {
  params: Promise<{ locale: string; occurrenceId: string }>;
}) {
  const { locale, occurrenceId } = await params;
  setRequestLocale(locale);

  const ctx = await requireUnlocked();
  const t = await getTranslations('events');
  const detail = await getOccurrenceDetail(occurrenceId, ctx.club.id);
  if (!detail) notFound();

  const isAdmin = roleSatisfies(ctx.member.role, 'club_admin');
  const now = new Date();
  const open = isOccurrenceOpen(
    {
      status: detail.occurrence.status,
      occurrenceDate: detail.occurrence.occurrenceDate,
      startsAt: detail.occurrence.startsAt,
    },
    now,
  );
  const myStatus = detail.roster.find((r) => r.memberId === ctx.member.id)?.status ?? null;

  const [y, m, d] = detail.occurrence.occurrenceDate.split('-').map(Number) as [number, number, number];
  const dateLabel = new Intl.DateTimeFormat(ctx.club.defaultLocale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(y, m - 1, d, 12));
  const timeLabel = new Intl.DateTimeFormat(ctx.club.defaultLocale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Prague',
  }).format(detail.occurrence.startsAt);

  const turnout = lowTurnoutKey(detail.goingCount);

  return (
    <main className="mx-auto max-w-md p-5">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{dateLabel}</h1>
          <p className="text-muted-foreground text-sm">
            {timeLabel} · {detail.occurrence.title ?? detail.occurrence.placeLabel}
            {detail.occurrence.status === 'cancelled' ? ` · ${t('cancelled')}` : !open ? ` · ${t('closed')}` : ''}
          </p>
        </div>
        <Link href={'/events' as Route} className="text-primary shrink-0 text-sm underline">
          ← {t('upcoming')}
        </Link>
      </header>

      {/* My RSVP (only while open) */}
      {open ? (
        <div className="mb-6">
          <RsvpToggle occurrenceId={detail.occurrence.id} status={myStatus} />
        </div>
      ) : null}

      {/* Headcount + low-turnout line */}
      <Card className="mb-4 p-4 text-center">
        <div className="text-3xl font-bold">{detail.goingCount}</div>
        <div className="text-muted-foreground text-sm">{t('whoIsComing')}</div>
        {turnout ? (
          <p className="text-muted-foreground mt-1 text-sm">
            {turnout === 'none' ? t('turnoutNone') : t('turnoutLow')}
          </p>
        ) : null}
      </Card>

      {/* Optional: beers tied to this evening */}
      {detail.linkedSessionId ? (
        <Link
          href={`/history/${detail.linkedSessionId}` as Route}
          className="text-primary mb-4 inline-flex items-center gap-1.5 text-sm underline"
        >
          <Beer className="h-4 w-4" aria-hidden /> {t('beersFromNight')}
        </Link>
      ) : null}

      {/* Roster */}
      <ul className="flex flex-col gap-1">
        {detail.roster.map((r) => (
          <li
            key={r.memberId}
            className="flex items-center gap-2 rounded-md px-1 py-1.5"
          >
            <MemberAvatar
              avatarKey={r.avatarKey}
              displayName={r.displayName}
              uploadUrl={avatarUploadUrl(r.memberId, r.avatarUploadAt)}
              className="h-7 w-7"
            />
            <span className="min-w-0 flex-1 truncate text-sm">{r.displayName}</span>
            {r.status === 'going' ? (
              <Check className="text-primary h-4 w-4 shrink-0" aria-label={t('going')} />
            ) : r.status === 'not_going' ? (
              <X className="text-destructive h-4 w-4 shrink-0" aria-label={t('notGoing')} />
            ) : (
              <span className="text-muted-foreground shrink-0 text-xs">{t('noAnswer')}</span>
            )}
            {/* US4 — admin-only on-behalf set, never shown to regular members */}
            {isAdmin && open ? (
              <AdminMemberRsvp
                occurrenceId={detail.occurrence.id}
                memberId={r.memberId}
                status={r.status}
              />
            ) : null}
          </li>
        ))}
      </ul>

      {/* US3 — admin cancel this occurrence */}
      {isAdmin && detail.occurrence.status === 'scheduled' ? (
        <div className="mt-6 border-t border-border pt-4">
          <CancelOccurrenceButton occurrenceId={detail.occurrence.id} />
        </div>
      ) : null}
    </main>
  );
}

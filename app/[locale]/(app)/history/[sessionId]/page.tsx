import type { Route } from 'next';
import { Link } from '@/lib/i18n/navigation';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Card } from '@/components/ui/card';
import { SessionTitleInlineEdit } from '@/components/session/session-title-inline-edit';
import { TabBeerBreakdown } from '@/components/tab/tab-beer-breakdown';
import { TabEntryRow } from '@/components/tab/tab-entry-row';
import { requireUnlocked } from '@/lib/auth/session';
import { getSessionDetail } from '@/lib/db/queries/consumption';
import { formatDayLabel, formatMoney, formatRelativeDay } from '@/lib/format';
import { groupTabEntriesByBeer } from '@/lib/tab/group-beer-breakdown';

// US8 — drill-down into one session: consumptions + bet transfers.
export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ locale: string; sessionId: string }>;
}) {
  const { locale, sessionId } = await params;
  setRequestLocale(locale);

  const ctx = await requireUnlocked();
  const t = await getTranslations('history');
  const tc = await getTranslations('common');
  const detail = await getSessionDetail({
    clubId: ctx.club.id,
    sessionId,
    memberId: ctx.member.id,
    userId: ctx.user.id,
    undoWindowSeconds: ctx.club.consumptionUndoWindowSeconds,
  });
  if (!detail) notFound();

  const { currencyCode, defaultLocale } = ctx.club;
  const now = new Date();
  const relativeLabels = { today: tc('today'), yesterday: tc('yesterday') };
  // Spec 028 follow-up — same per-beer breakdown as /tab, reusing the
  // identical entries (getSessionDetail wraps getMyTabForSession). The
  // breakdown carries its own prominent total (== detail.totalMinor by
  // the balance invariant), so the standalone total card is now only the
  // empty-tab fallback — parity with /tab.
  const breakdownGroups = groupTabEntriesByBeer(detail.entries);

  return (
    <main className="mx-auto max-w-md p-5">
      <header className="mb-4">
        <div className="flex items-start justify-between gap-3">
          <h1 className="min-w-0 flex-1 text-2xl font-bold">
            <SessionTitleInlineEdit
              sessionId={detail.session.id}
              currentTitle={detail.session.title}
              fallbackLabel={formatDayLabel(detail.session.startedAt, defaultLocale)}
            />
          </h1>
          <Link href={'/history' as Route} className="text-primary shrink-0 text-sm underline">
            ← {t('title')}
          </Link>
        </div>
        <p className="text-muted-foreground text-sm">
          {formatRelativeDay(detail.session.startedAt, now, defaultLocale, relativeLabels, 'date')}
          {detail.session.endedAt ? '' : ` · ${t('stillOpen')}`}
        </p>
      </header>

      {breakdownGroups.length === 0 ? (
        <Card className="mb-6 p-4">
          <div className="text-muted-foreground text-sm">{t('yourTotal')}</div>
          <div className="text-3xl font-bold">
            {formatMoney(detail.totalMinor, currencyCode, defaultLocale)}
          </div>
        </Card>
      ) : (
        <div className="mb-6">
          <TabBeerBreakdown
            groups={breakdownGroups}
            currencyCode={currencyCode}
            locale={defaultLocale}
            now={now}
          />
        </div>
      )}

      {/* Spec 030 — render entries with the shared TabEntryRow (same as
          /tab) so won-bet beers show as "z vyhrané sázky: platí {loser}"
          (struck-through, non-counting) and lost-bet beers as "z prohrané
          sázky". Replaces the old plain list + separate bet-transfers
          section (which rendered won beers as ordinary drinks). */}
      <h2 className="mb-2 text-sm font-medium">{t('yourDrinks')}</h2>
      <ul className="flex flex-col gap-2">
        {detail.entries.map((e) => (
          <TabEntryRow
            key={`${e.kind}-${e.id}`}
            entry={e}
            currencyCode={currencyCode}
            locale={defaultLocale}
          />
        ))}
        {detail.entries.length === 0 ? (
          <li className="text-muted-foreground p-3 text-center text-sm">
            {t('noDrinksInSession')}
          </li>
        ) : null}
      </ul>
    </main>
  );
}

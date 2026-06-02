import type { Route } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link } from '@/lib/i18n/navigation';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SessionTitleInlineEdit } from '@/components/session/session-title-inline-edit';
import { TabBeerBreakdown } from '@/components/tab/tab-beer-breakdown';
import { TabEntryRow } from '@/components/tab/tab-entry-row';
import { requireUnlocked } from '@/lib/auth/session';
import { memberBalance } from '@/lib/balance/calculate';
import { getMyTabForSession } from '@/lib/db/queries/consumption';
import { getOpenSessionForClub } from '@/lib/db/queries/sessions';
import { formatDayLabel, formatMoney } from '@/lib/format';
import { groupTabEntriesByBeer } from '@/lib/tab/group-beer-breakdown';

export default async function TabPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const ctx = await requireUnlocked();
  const t = await getTranslations('tab');
  const tHome = await getTranslations('home');
  const session = await getOpenSessionForClub(ctx.club.id);
  const [tab, outstandingBalanceMinor] = await Promise.all([
    getMyTabForSession({
      memberId: ctx.member.id,
      userId: ctx.user.id,
      session,
      undoWindowSeconds: ctx.club.consumptionUndoWindowSeconds,
    }),
    memberBalance(ctx.member.id),
  ]);
  const owes = outstandingBalanceMinor > 0n;
  // Spec 028 — per-beer breakdown of this round's tab (pure transform
  // of the entries already loaded; sums to tab.totalMinor).
  const breakdownGroups = groupTabEntriesByBeer(tab.entries);

  return (
    <main className="mx-auto max-w-md p-5">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        {tab.session ? (
          <SessionTitleInlineEdit
            sessionId={tab.session.id}
            currentTitle={tab.session.title}
            fallbackLabel={formatDayLabel(tab.session.startedAt, ctx.club.defaultLocale)}
            className="text-muted-foreground text-sm"
          />
        ) : (
          <p className="text-muted-foreground text-sm">{t('noOpenSession')}</p>
        )}
      </header>

      {/* The beer breakdown carries its own prominent total, so the
          standalone total card is only a fallback for an empty tab
          (no countable beers → breakdown renders nothing). Avoids the
          two-stacked-250-Kč duplication. */}
      {breakdownGroups.length === 0 ? (
        <Card className="mb-6 p-4">
          <div className="text-muted-foreground text-sm">{t('sessionTotal')}</div>
          <div className="text-3xl font-bold">
            {formatMoney(tab.totalMinor, ctx.club.currencyCode, ctx.club.defaultLocale)}
          </div>
        </Card>
      ) : null}

      <TabBeerBreakdown
        groups={breakdownGroups}
        currencyCode={ctx.club.currencyCode}
        locale={ctx.club.defaultLocale}
        now={new Date()}
      />

      {owes ? (
        <Link
          href={'/settle' as Route}
          className={buttonVariants({
            size: 'lg',
            className: 'mb-6 h-14 w-full text-base',
          })}
        >
          {tHome('settleCta')}
        </Link>
      ) : null}

      <ul className="flex flex-col gap-2">
        {tab.entries.map((entry) => (
          <TabEntryRow
            key={`${entry.kind}-${entry.id}`}
            entry={entry}
            currencyCode={ctx.club.currencyCode}
            locale={ctx.club.defaultLocale}
          />
        ))}
        {tab.entries.length === 0 ? (
          <li className="text-muted-foreground p-4 text-center">{t('empty')}</li>
        ) : null}
      </ul>
    </main>
  );
}

import type { Route } from 'next';
import { Link } from '@/lib/i18n/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Card } from '@/components/ui/card';
import { SessionTitleInlineEdit } from '@/components/session/session-title-inline-edit';
import { StopRowNavigation } from '@/components/history/stop-row-navigation';
import { requireUnlocked } from '@/lib/auth/session';
import { getSessionHistory } from '@/lib/db/queries/consumption';
import { formatMoney } from '@/lib/format';

// US8 — cross-session history: every session the member drank in.
export default async function HistoryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const ctx = await requireUnlocked();
  const t = await getTranslations('history');
  const sessions = await getSessionHistory({ clubId: ctx.club.id, memberId: ctx.member.id });
  const { currencyCode, defaultLocale } = ctx.club;
  const dateFmt = new Intl.DateTimeFormat(defaultLocale, { dateStyle: 'medium' });

  return (
    <main className="mx-auto max-w-md p-5">
      <h1 className="mb-4 text-2xl font-bold">{t('title')}</h1>

      <ul className="flex flex-col gap-2">
        {sessions.map((s) => (
          <li key={s.id}>
            <Link href={`/history/${s.id}` as Route}>
              <Card className="hover:bg-accent flex items-center justify-between gap-3 p-3 transition-colors">
                <div className="min-w-0 flex-1">
                  {/* Spec 022 follow-up — inline-editable session title
                      on the list view. StopRowNavigation prevents
                      taps on the title (or its edit input) from
                      bubbling to the parent Link, so clicking the
                      title edits in place while the rest of the row
                      still navigates to the detail page. */}
                  <StopRowNavigation>
                    <SessionTitleInlineEdit
                      sessionId={s.id}
                      currentTitle={s.title}
                      fallbackLabel={t('drinkSession')}
                      className="font-medium"
                    />
                  </StopRowNavigation>
                  <div className="text-muted-foreground text-xs">
                    {dateFmt.format(s.startedAt)}
                    {s.endedAt ? '' : ` · ${t('open')}`}
                  </div>
                </div>
                <div className="font-mono text-sm font-semibold">
                  {formatMoney(s.myTotalMinor, currencyCode, defaultLocale)}
                </div>
              </Card>
            </Link>
          </li>
        ))}
        {sessions.length === 0 ? (
          <li className="text-muted-foreground p-4 text-center text-sm">{t('noSessions')}</li>
        ) : null}
      </ul>
    </main>
  );
}

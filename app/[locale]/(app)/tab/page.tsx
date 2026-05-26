import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Card } from '@/components/ui/card';
import { TabEntryRow } from '@/components/tab/tab-entry-row';
import { requireUnlocked } from '@/lib/auth/session';
import { getMyTabForSession } from '@/lib/db/queries/consumption';
import { getOpenSessionForClub } from '@/lib/db/queries/sessions';
import { formatMoney } from '@/lib/format';

export default async function TabPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const ctx = await requireUnlocked();
  const t = await getTranslations('tab');
  const session = await getOpenSessionForClub(ctx.club.id);
  const tab = await getMyTabForSession({
    memberId: ctx.member.id,
    userId: ctx.user.id,
    session,
    undoWindowSeconds: ctx.club.consumptionUndoWindowSeconds,
  });

  return (
    <main className="mx-auto max-w-2xl p-5">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        {tab.session ? (
          <p className="text-muted-foreground text-sm">{tab.session.title}</p>
        ) : (
          <p className="text-muted-foreground text-sm">{t('noOpenSession')}</p>
        )}
      </header>

      <Card className="mb-6 p-4">
        <div className="text-muted-foreground text-sm">{t('sessionTotal')}</div>
        <div className="text-3xl font-bold">
          {formatMoney(tab.totalMinor, ctx.club.currencyCode, ctx.club.defaultLocale)}
        </div>
      </Card>

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

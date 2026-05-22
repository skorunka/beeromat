import { getTranslations, setRequestLocale } from 'next-intl/server';

import { UndoButton } from '@/components/log/undo-button';
import { Card } from '@/components/ui/card';
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
          <li
            key={entry.id}
            className={`flex items-center justify-between rounded-md border p-3 ${entry.voided ? 'opacity-50' : ''}`}
          >
            <div>
              <div className="font-medium">{entry.beerTypeName}</div>
              <div className="text-muted-foreground text-xs">
                {new Intl.DateTimeFormat(ctx.club.defaultLocale, {
                  timeStyle: 'short',
                }).format(entry.createdAt)}
                {entry.voided ? ` · ${t('voided')}` : null}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="font-mono text-sm">
                {formatMoney(entry.unitPriceMinor, ctx.club.currencyCode, ctx.club.defaultLocale)}
              </div>
              {entry.canUndo ? <UndoButton consumptionId={entry.id} /> : null}
            </div>
          </li>
        ))}
        {tab.entries.length === 0 ? (
          <li className="text-muted-foreground p-4 text-center">{t('empty')}</li>
        ) : null}
      </ul>
    </main>
  );
}

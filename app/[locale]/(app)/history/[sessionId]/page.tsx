import type { Route } from 'next';
import { Link } from '@/lib/i18n/navigation';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Card } from '@/components/ui/card';
import { requireUnlocked } from '@/lib/auth/session';
import { getSessionDetail } from '@/lib/db/queries/consumption';
import { formatMoney } from '@/lib/format';

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
  const tBet = await getTranslations('bet');
  const detail = await getSessionDetail({
    clubId: ctx.club.id,
    sessionId,
    memberId: ctx.member.id,
    userId: ctx.user.id,
    undoWindowSeconds: ctx.club.consumptionUndoWindowSeconds,
  });
  if (!detail) notFound();

  const { currencyCode, defaultLocale } = ctx.club;
  const timeFmt = new Intl.DateTimeFormat(defaultLocale, { timeStyle: 'short' });
  const dateFmt = new Intl.DateTimeFormat(defaultLocale, { dateStyle: 'medium' });

  return (
    <main className="mx-auto max-w-2xl p-5">
      <Link href={'/history' as Route} className="text-primary text-sm underline">
        ← {t('title')}
      </Link>
      <header className="mt-2 mb-4">
        <h1 className="text-2xl font-bold">{detail.session.title ?? t('drinkSession')}</h1>
        <p className="text-muted-foreground text-sm">
          {dateFmt.format(detail.session.startedAt)}
          {detail.session.endedAt ? '' : ` · ${t('stillOpen')}`}
        </p>
      </header>

      <Card className="mb-6 p-4">
        <div className="text-muted-foreground text-sm">{t('yourTotal')}</div>
        <div className="text-3xl font-bold">
          {formatMoney(detail.totalMinor, currencyCode, defaultLocale)}
        </div>
      </Card>

      <h2 className="mb-2 text-sm font-medium">{t('yourDrinks')}</h2>
      <ul className="mb-6 flex flex-col gap-2">
        {detail.entries.map((e) => (
          <li
            key={e.id}
            className={`flex items-center justify-between rounded-md border p-3 ${
              e.voided ? 'opacity-50' : ''
            }`}
          >
            <div>
              <div className="font-medium">{e.beerTypeName}</div>
              <div className="text-muted-foreground text-xs">
                {timeFmt.format(e.createdAt)}
                {e.voided ? ` · ${tBet('undone')}` : ''}
              </div>
            </div>
            <div className="font-mono text-sm">
              {formatMoney(e.unitPriceMinor, currencyCode, defaultLocale)}
            </div>
          </li>
        ))}
        {detail.entries.length === 0 ? (
          <li className="text-muted-foreground p-3 text-center text-sm">
            {t('noDrinksInSession')}
          </li>
        ) : null}
      </ul>

      {detail.transfers.length > 0 ? (
        <>
          <h2 className="mb-2 text-sm font-medium">{t('betTransfers')}</h2>
          <ul className="flex flex-col gap-2">
            {detail.transfers.map((tr) => {
              const tookByMe = tr.toMemberId === ctx.member.id;
              return (
                <li
                  key={tr.id}
                  className={`flex items-center justify-between rounded-md border p-3 ${
                    tr.voided ? 'opacity-50' : ''
                  }`}
                >
                  <div className="text-sm">
                    {tookByMe
                      ? tBet('youTook', { name: tr.fromMemberName, beer: tr.beerTypeName })
                      : tBet('tookYours', { name: tr.toMemberName, beer: tr.beerTypeName })}
                    {tr.voided ? ` · ${tBet('undone')}` : ''}
                  </div>
                  <div className="font-mono text-sm">
                    {tookByMe ? '+' : '−'}
                    {formatMoney(tr.unitPriceMinorSnapshot, currencyCode, defaultLocale)}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </main>
  );
}

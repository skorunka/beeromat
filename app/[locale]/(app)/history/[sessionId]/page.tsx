import type { Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';

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
    <main className="mx-auto max-w-2xl p-4">
      <Link href={'/history' as Route} className="text-primary text-sm underline">
        ← My history
      </Link>
      <header className="mt-2 mb-4">
        <h1 className="text-xl font-semibold">{detail.session.title ?? 'Drink session'}</h1>
        <p className="text-muted-foreground text-sm">
          {dateFmt.format(detail.session.startedAt)}
          {detail.session.endedAt ? '' : ' · still open'}
        </p>
      </header>

      <Card className="mb-6 p-4">
        <div className="text-muted-foreground text-sm">Your total this session</div>
        <div className="text-3xl font-bold">
          {formatMoney(detail.totalMinor, currencyCode, defaultLocale)}
        </div>
      </Card>

      <h2 className="mb-2 text-sm font-medium">Your drinks</h2>
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
                {e.voided ? ' · voided' : ''}
              </div>
            </div>
            <div className="font-mono text-sm">
              {formatMoney(e.unitPriceMinor, currencyCode, defaultLocale)}
            </div>
          </li>
        ))}
        {detail.entries.length === 0 ? (
          <li className="text-muted-foreground p-3 text-center text-sm">
            No drinks logged in this session.
          </li>
        ) : null}
      </ul>

      {detail.transfers.length > 0 ? (
        <>
          <h2 className="mb-2 text-sm font-medium">Bet transfers</h2>
          <ul className="flex flex-col gap-2">
            {detail.transfers.map((t) => {
              const tookByMe = t.toMemberId === ctx.member.id;
              return (
                <li
                  key={t.id}
                  className={`flex items-center justify-between rounded-md border p-3 ${
                    t.voided ? 'opacity-50' : ''
                  }`}
                >
                  <div className="text-sm">
                    {tookByMe
                      ? `You took ${t.fromMemberName}'s ${t.beerTypeName}`
                      : `${t.toMemberName} took your ${t.beerTypeName}`}
                    {t.voided ? ' · undone' : ''}
                  </div>
                  <div className="font-mono text-sm">
                    {tookByMe ? '+' : '−'}
                    {formatMoney(t.unitPriceMinorSnapshot, currencyCode, defaultLocale)}
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

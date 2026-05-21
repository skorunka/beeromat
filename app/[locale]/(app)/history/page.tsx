import type { Route } from 'next';
import Link from 'next/link';
import { setRequestLocale } from 'next-intl/server';

import { Card } from '@/components/ui/card';
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
  const sessions = await getSessionHistory({ clubId: ctx.club.id, memberId: ctx.member.id });
  const { currencyCode, defaultLocale } = ctx.club;
  const dateFmt = new Intl.DateTimeFormat(defaultLocale, { dateStyle: 'medium' });

  return (
    <main className="mx-auto max-w-2xl p-4">
      <h1 className="mb-4 text-xl font-semibold">My history</h1>

      <ul className="flex flex-col gap-2">
        {sessions.map((s) => (
          <li key={s.id}>
            <Link href={`/history/${s.id}` as Route}>
              <Card className="hover:bg-accent flex items-center justify-between gap-3 p-3 transition-colors">
                <div className="min-w-0">
                  <div className="truncate font-medium">{s.title ?? 'Drink session'}</div>
                  <div className="text-muted-foreground text-xs">
                    {dateFmt.format(s.startedAt)}
                    {s.endedAt ? '' : ' · open'}
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
          <li className="text-muted-foreground p-4 text-center text-sm">
            No sessions yet — your drink history will appear here.
          </li>
        ) : null}
      </ul>
    </main>
  );
}

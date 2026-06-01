import type { Route } from 'next';
import { Link } from '@/lib/i18n/navigation';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Card } from '@/components/ui/card';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { SessionTitleInlineEdit } from '@/components/session/session-title-inline-edit';
import { avatarUploadUrl } from '@/lib/avatars/upload-url';
import { requireUnlocked } from '@/lib/auth/session';
import { getSessionDetail } from '@/lib/db/queries/consumption';
import { formatDayLabel, formatMoney, formatRelativeDay } from '@/lib/format';

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
  const timeFmt = new Intl.DateTimeFormat(defaultLocale, { timeStyle: 'short' });
  const now = new Date();
  const relativeLabels = { today: tc('today'), yesterday: tc('yesterday') };

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
              const counterparty = tookByMe
                ? {
                    id: tr.fromMemberId,
                    name: tr.fromMemberName,
                    avatarKey: tr.fromAvatarKey,
                    avatarUploadAt: tr.fromAvatarUploadAt,
                  }
                : {
                    id: tr.toMemberId,
                    name: tr.toMemberName,
                    avatarKey: tr.toAvatarKey,
                    avatarUploadAt: tr.toAvatarUploadAt,
                  };
              return (
                <li
                  key={tr.id}
                  className={`flex items-center justify-between rounded-md border p-3 ${
                    tr.voided ? 'opacity-50' : ''
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2 text-sm">
                    <MemberAvatar
                      size="inline"
                      avatarKey={counterparty.avatarKey}
                      displayName={counterparty.name}
                      uploadUrl={avatarUploadUrl(counterparty.id, counterparty.avatarUploadAt)}
                    />
                    <span className="min-w-0 truncate">
                      {tookByMe
                        ? tBet('youTook', { name: tr.fromMemberName, beer: tr.beerTypeName })
                        : tBet('tookYours', { name: tr.toMemberName, beer: tr.beerTypeName })}
                      {tr.voided ? ` · ${tBet('undone')}` : ''}
                    </span>
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

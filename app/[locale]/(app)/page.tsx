import type { Route } from 'next';
import { Link } from '@/lib/i18n/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { buttonVariants } from '@/components/ui/button';
import { HomeOneTapLog } from '@/components/home/home-one-tap-log';
import { MatchBetModule } from '@/components/home/match-bet-module';
import { requireUnlocked } from '@/lib/auth/session';
import { memberBalance } from '@/lib/balance/calculate';
import { lastBeerForMember } from '@/lib/db/queries/consumption';
import { matchBetSummaryForMember } from '@/lib/db/queries/match-bet-summary';
import { formatMoney } from '@/lib/format';

// Spec 017 — home as the single action surface for the daily core
// loop. Primary CTA = one-tap log of the member's last beer. Balance
// rendered as a friendly sentence (no nag tone). Settle CTA stays
// secondary, visible only when owing.
export default async function AppHomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const ctx = await requireUnlocked();
  const t = await getTranslations('home');
  const [balanceMinor, lastBeer, betSummary] = await Promise.all([
    memberBalance(ctx.member.id),
    lastBeerForMember(ctx.member.id, ctx.club.id),
    matchBetSummaryForMember(ctx.member.id, ctx.club.id),
  ]);
  const owes = balanceMinor > 0n;
  const balanceFormatted = formatMoney(
    balanceMinor,
    ctx.club.currencyCode,
    ctx.club.defaultLocale,
  );

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-5">
      <header className="flex flex-col gap-1">
        <Link
          href="/account"
          className="text-foreground hover:text-primary inline-flex min-h-11 items-center text-base font-medium transition-colors"
        >
          {t('greeting', { name: ctx.member.displayName })}
        </Link>
        <p
          className={
            owes
              ? 'text-primary text-xl font-bold tabular-nums leading-relaxed'
              : 'text-foreground text-xl font-medium leading-relaxed'
          }
        >
          {owes ? t('balanceOwed', { amount: balanceFormatted }) : t('balanceSquare')}
        </p>
      </header>

      <MatchBetModule
        betCount={betSummary.betCount}
        sourceMatchIds={betSummary.sourceMatchIds}
      />

      <HomeOneTapLog
        beer={lastBeer}
        currencyCode={ctx.club.currencyCode}
        locale={ctx.club.defaultLocale}
      />

      {owes ? (
        <Link
          href={'/settle' as Route}
          className={buttonVariants({ variant: 'outline', size: 'default', className: 'self-center' })}
        >
          {t('settleCta')}
        </Link>
      ) : null}
    </main>
  );
}

import { Link } from '@/lib/i18n/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { requireUnlocked } from '@/lib/auth/session';
import { memberBalance } from '@/lib/balance/calculate';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

// Home of the authenticated app — the dashboard. Daily destinations
// live in the persistent bottom nav (US7); home gives the outstanding
// balance the whole stage and offers the one balance-dependent action.
export default async function AppHomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const ctx = await requireUnlocked();
  const t = await getTranslations('home');
  const balanceMinor = await memberBalance(ctx.member.id);
  const owes = balanceMinor > 0n;

  return (
    <main className="mx-auto max-w-md p-5">
      <header className="mb-7 flex flex-col gap-1">
        <Link
          href="/account"
          className="text-foreground hover:text-primary inline-flex min-h-11 items-center text-base font-medium transition-colors"
        >
          {t('greeting', { name: ctx.member.displayName })}
        </Link>
        <h1 className="text-2xl font-bold leading-tight">{ctx.club.name}</h1>
      </header>

      {/* The outstanding balance — the focal point of the home screen.
          A non-zero tab is drawn in the brand amber to pull the eye. */}
      <Card className="items-center gap-3 py-10 text-center">
        <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          {t('outstandingBalance')}
        </span>
        <span
          className={cn(
            'text-5xl font-extrabold tabular-nums',
            owes ? 'text-primary' : 'text-foreground',
          )}
        >
          {formatMoney(balanceMinor, ctx.club.currencyCode, ctx.club.defaultLocale)}
        </span>
        {owes ? (
          <Link
            href="/settle"
            className={cn(
              buttonVariants({ size: 'lg' }),
              'mt-3 h-14 w-[calc(100%-2.5rem)] text-base',
            )}
          >
            {t('settleUp')}
          </Link>
        ) : (
          <span className="text-muted-foreground mt-1 text-sm">{t('allSquare')}</span>
        )}
      </Card>
    </main>
  );
}

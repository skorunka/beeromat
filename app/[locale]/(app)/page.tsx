import { Link } from '@/lib/i18n/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Card } from '@/components/ui/card';
import { LanguageSwitcher } from '@/components/nav/language-switcher';
import { requireUnlocked } from '@/lib/auth/session';
import { memberBalance } from '@/lib/balance/calculate';
import { formatMoney } from '@/lib/format';

// Home of the authenticated app — the dashboard. Daily destinations
// live in the persistent bottom nav (US7); home shows the balance and
// the one balance-dependent action, Settle up.
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

  return (
    <main className="mx-auto max-w-md p-4">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/account"
            className="text-muted-foreground inline-flex min-h-11 items-center text-sm underline"
          >
            {t('greeting', { name: ctx.member.displayName })}
          </Link>
          <h1 className="text-2xl font-bold">{ctx.club.name}</h1>
        </div>
        <LanguageSwitcher />
      </header>

      <Card className="mb-6 p-6">
        <div className="text-muted-foreground text-sm">{t('outstandingBalance')}</div>
        <div className="mt-1 text-4xl font-bold">
          {formatMoney(balanceMinor, ctx.club.currencyCode, ctx.club.defaultLocale)}
        </div>
      </Card>

      {balanceMinor > 0n ? (
        <Link
          href="/settle"
          className="bg-primary text-primary-foreground hover:bg-primary/90 flex h-14 items-center justify-center rounded-lg text-lg font-semibold"
        >
          {t('settleUp')}
        </Link>
      ) : null}
    </main>
  );
}

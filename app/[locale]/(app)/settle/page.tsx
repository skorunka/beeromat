import type { Route } from 'next';
import { Link } from '@/lib/i18n/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { PaidOtherMethod } from '@/components/settle/paid-other-method';
import { QrDisplay } from '@/components/settle/qr-display';
import { RevolutButton } from '@/components/settle/revolut-button';
import { WithdrawClaimButton } from '@/components/settle/withdraw-claim-button';
import { Card } from '@/components/ui/card';
import { requireUnlocked } from '@/lib/auth/session';
import { getMyBalance } from '@/lib/db/queries/payments';
import { formatMoney } from '@/lib/format';
import { initiateSettleAction } from './actions';

// US2 — Settle my tab. The page eagerly calls initiateSettle so the QR
// is ready on first paint; an unused variable symbol is cheap (gaps are
// expected and harmless).
export default async function SettlePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const ctx = await requireUnlocked();
  const t = await getTranslations('settle');
  const tCommon = await getTranslations('common');
  const { currencyCode, defaultLocale } = ctx.club;
  const result = await initiateSettleAction();

  if (!result.ok) {
    const balance = await getMyBalance(ctx.member.id, currencyCode);
    return (
      <main className="mx-auto max-w-md p-5">
        <h1 className="mb-4 text-2xl font-bold">{t('title')}</h1>
        <Card className="p-6 text-center">
          {result.reason === 'NO_BALANCE' ? (
            <p className="text-lg font-medium">{t('allSettled')}</p>
          ) : result.reason === 'CLAIM_PENDING' ? (
            <>
              <p className="text-lg font-medium">{t('awaitingTitle')}</p>
              <p className="text-muted-foreground mt-2 text-sm">
                {t('awaitingBody', {
                  amount: formatMoney(
                    balance.pendingConfirmationMinor,
                    currencyCode,
                    defaultLocale,
                  ),
                })}
              </p>
              {/* Escape hatch — withdraw a mistaken claim instead of
                  waiting for the treasurer (back to the pay screen). */}
              <div className="mt-1 flex justify-center">
                <WithdrawClaimButton />
              </div>
            </>
          ) : (
            <>
              <p className="text-lg font-medium">{t('notSetUpTitle')}</p>
              <p className="text-muted-foreground mt-2 text-sm">{t('notSetUpBody')}</p>
            </>
          )}
          <Link
            href={'/' as Route}
            className="text-primary mt-4 inline-block text-sm underline"
          >
            {tCommon('backHome')}
          </Link>
        </Card>
      </main>
    );
  }

  const { settle } = result;
  const amountMinor = BigInt(settle.amountMinor);
  const amountDisplay = formatMoney(amountMinor, currencyCode, defaultLocale);

  return (
    <main className="mx-auto max-w-md p-5">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground text-sm">
          {t('payToClear', { amount: amountDisplay })}
        </p>
      </header>

      <QrDisplay
        qrSvg={settle.qrSvg}
        amountDisplay={amountDisplay}
        variableSymbol={settle.variableSymbol}
      />

      <RevolutButton revolutUrl={settle.revolutUrl} amountDisplay={amountDisplay} />

      <PaidOtherMethod
        defaultAmountMinor={settle.amountMinor}
        currencyCode={currencyCode}
      />
    </main>
  );
}

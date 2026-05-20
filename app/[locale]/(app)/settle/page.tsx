import type { Route } from 'next';
import Link from 'next/link';
import { setRequestLocale } from 'next-intl/server';

import { PaidOtherMethod } from '@/components/settle/paid-other-method';
import { QrDisplay } from '@/components/settle/qr-display';
import { RevolutButton } from '@/components/settle/revolut-button';
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
  const { currencyCode, defaultLocale } = ctx.club;
  const result = await initiateSettleAction();

  if (!result.ok) {
    const balance = await getMyBalance(ctx.member.id, currencyCode);
    return (
      <main className="mx-auto max-w-md p-4">
        <h1 className="mb-4 text-xl font-semibold">Settle up</h1>
        <Card className="p-6 text-center">
          {result.reason === 'NO_BALANCE' ? (
            <p className="text-lg font-medium">You&apos;re all settled up. Cheers!</p>
          ) : result.reason === 'CLAIM_PENDING' ? (
            <>
              <p className="text-lg font-medium">Payment awaiting confirmation</p>
              <p className="text-muted-foreground mt-2 text-sm">
                You&apos;ve marked{' '}
                {formatMoney(balance.pendingConfirmationMinor, currencyCode, defaultLocale)}{' '}
                as paid. The treasurer will confirm it shortly.
              </p>
            </>
          ) : (
            <>
              <p className="text-lg font-medium">Payment details not set up</p>
              <p className="text-muted-foreground mt-2 text-sm">
                Your club admin hasn&apos;t added bank details yet. Ask them to
                configure the club banking profile.
              </p>
            </>
          )}
          <Link
            href={'/' as Route}
            className="text-primary mt-4 inline-block text-sm underline"
          >
            Back home
          </Link>
        </Card>
      </main>
    );
  }

  const { settle } = result;
  const amountMinor = BigInt(settle.amountMinor);
  const amountDisplay = formatMoney(amountMinor, currencyCode, defaultLocale);

  return (
    <main className="mx-auto max-w-md p-4">
      <header className="mb-4">
        <h1 className="text-xl font-semibold">Settle up</h1>
        <p className="text-muted-foreground text-sm">
          Pay {amountDisplay} to clear your tab.
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

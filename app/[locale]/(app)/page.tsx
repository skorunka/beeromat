import Link from 'next/link';
import { setRequestLocale } from 'next-intl/server';

import { Card } from '@/components/ui/card';
import { requireUnlocked } from '@/lib/auth/session';
import { memberBalance } from '@/lib/balance/calculate';
import { formatMoney } from '@/lib/format';

// Home of the authenticated app — quick balance + entry points.
export default async function AppHomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const ctx = await requireUnlocked();
  const balanceMinor = await memberBalance(ctx.member.id);

  return (
    <main className="mx-auto max-w-md p-4">
      <header className="mb-6">
        <p className="text-muted-foreground text-sm">Hi, {ctx.member.displayName}</p>
        <h1 className="text-2xl font-bold">{ctx.club.name}</h1>
      </header>

      <Card className="mb-6 p-6">
        <div className="text-muted-foreground text-sm">Outstanding balance</div>
        <div className="mt-1 text-4xl font-bold">
          {formatMoney(balanceMinor, ctx.club.currencyCode, ctx.club.defaultLocale)}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/log"
          className="bg-primary text-primary-foreground hover:bg-primary/90 flex h-24 items-center justify-center rounded-lg text-lg font-semibold"
        >
          Log a beer
        </Link>
        <Link
          href="/tab"
          className="border-input bg-background hover:bg-accent flex h-24 items-center justify-center rounded-lg border text-lg font-semibold"
        >
          My tab
        </Link>
      </div>
    </main>
  );
}

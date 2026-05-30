import { and, eq, gt } from 'drizzle-orm';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link } from '@/lib/i18n/navigation';
import { db } from '@/lib/db/client';
import { requireUnlocked } from '@/lib/auth/session';
import { beerTypes } from '@/lib/db/schema/catalog';
import { listOtherActiveMembers } from '@/lib/db/queries/members';
import { LogOnBehalfForm } from '@/components/log/log-on-behalf-form';

// Spec 019 — on-behalf flow page reachable from home + /log via
// the LogForOtherLink affordance. Loads the active members
// (excluding the actor) + active in-stock beers + renders the form.

export default async function LogOnBehalfPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const ctx = await requireUnlocked();
  const t = await getTranslations('log.onBehalf');
  const tCommon = await getTranslations('common');

  const [otherMembers, inStockBeers] = await Promise.all([
    listOtherActiveMembers(ctx.club.id, ctx.member.id),
    db
      .select({
        id: beerTypes.id,
        name: beerTypes.name,
        currentStock: beerTypes.currentStock,
      })
      .from(beerTypes)
      .where(
        and(
          eq(beerTypes.clubId, ctx.club.id),
          eq(beerTypes.isArchived, false),
          gt(beerTypes.currentStock, 0),
        ),
      )
      .orderBy(beerTypes.displayOrder),
  ]);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-5">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold leading-tight">{t('title')}</h1>
        <Link
          href="/"
          className="text-muted-foreground text-sm underline-offset-4 hover:underline"
        >
          ← {tCommon('backHome')}
        </Link>
      </header>

      {otherMembers.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('noOtherMembers')}</p>
      ) : (
        <LogOnBehalfForm members={otherMembers} beers={inStockBeers} />
      )}
    </main>
  );
}

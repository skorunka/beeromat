import { and, eq, ne, sql } from 'drizzle-orm';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { BeerGrid } from '@/components/log/beer-grid';
import { LogForOtherLink } from '@/components/log/log-for-other-link';
import { db } from '@/lib/db/client';
import { requireUnlocked } from '@/lib/auth/session';
import { getBeerTypeCatalog } from '@/lib/db/queries/catalog';
import { members } from '@/lib/db/schema/members';

export default async function LogPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const ctx = await requireUnlocked();
  const t = await getTranslations('log');
  const [beers, otherMembersCountResult] = await Promise.all([
    getBeerTypeCatalog(ctx.club.id),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(members)
      .where(
        and(
          eq(members.clubId, ctx.club.id),
          eq(members.isActive, true),
          ne(members.id, ctx.member.id),
        ),
      ),
  ]);
  const hasOtherMembers = (otherMembersCountResult[0]?.n ?? 0) > 0;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-5">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <BeerGrid
        beers={beers}
        currencyCode={ctx.club.currencyCode}
        locale={ctx.club.defaultLocale}
      />
      <LogForOtherLink hasOtherMembers={hasOtherMembers} className="self-center" />
    </main>
  );
}

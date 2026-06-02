import type { Route } from 'next';
import { Link } from '@/lib/i18n/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { FilterList } from '@/components/ui/filter-list';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { requireRole } from '@/lib/auth/session';
import { getAllMemberBalances } from '@/lib/db/queries/payments';
import { avatarUploadUrl } from '@/lib/avatars/upload-url';
import { formatMoney } from '@/lib/format';

// US3 — treasurer's all-members balance overview, biggest debtors first.
export default async function BalancesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const ctx = await requireRole('treasurer', 'club_admin');
  const t = await getTranslations('treasurer');
  const tCommon = await getTranslations('common');
  const balances = await getAllMemberBalances(ctx.club.id);
  const { currencyCode, defaultLocale } = ctx.club;

  return (
    <main className="mx-auto max-w-md p-5">
      <header className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('balancesTitle')}</h1>
        <div className="flex items-center gap-3">
          <Link href={'/admin/pending' as Route} className="text-primary text-sm underline">
            {t('pendingTitle')}
          </Link>
          <Link
            href={'/admin' as Route}
            className="text-muted-foreground hover:text-foreground text-sm underline"
          >
            ← {tCommon('back')}
          </Link>
        </div>
      </header>

      {balances.length === 0 ? (
        <p className="text-muted-foreground p-4 text-center text-sm">{t('noMembers')}</p>
      ) : (
        <FilterList
          placeholder={tCommon('searchMember')}
          emptyText={tCommon('noMembersFound')}
          items={balances.map((b) => ({
            key: b.memberId,
            searchText: b.displayName,
            node: (
              <Link href={`/admin/balances/${b.memberId}` as Route}>
                <Card className="hover:bg-accent flex flex-row items-center gap-3 p-3 transition-colors">
                  <MemberAvatar
                    avatarKey={b.avatarKey}
                    displayName={b.displayName}
                    uploadUrl={avatarUploadUrl(b.memberId, b.avatarUploadAt)}
                    className="h-10 w-10 text-xs"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">
                      {b.displayName}
                      {b.isActive ? null : (
                        <Badge variant="outline" className="ml-2">
                          {t('inactive')}
                        </Badge>
                      )}
                    </div>
                    {b.pendingConfirmationMinor > 0n ? (
                      <div className="text-muted-foreground text-xs">
                        {t('pendingConfirmation', {
                          amount: formatMoney(
                            b.pendingConfirmationMinor,
                            currencyCode,
                            defaultLocale,
                          ),
                        })}
                      </div>
                    ) : null}
                  </div>
                  <div
                    className={`font-mono text-sm font-semibold ${
                      b.balanceMinor > 0n ? '' : 'text-muted-foreground'
                    }`}
                  >
                    {formatMoney(b.balanceMinor, currencyCode, defaultLocale)}
                  </div>
                </Card>
              </Link>
            ),
          }))}
        />
      )}
    </main>
  );
}

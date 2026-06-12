import type { Route } from 'next';
import { Link } from '@/lib/i18n/navigation';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { ManualPaymentForm } from '@/components/treasurer/manual-payment-form';
import { TabEntryRow } from '@/components/tab/tab-entry-row';
import { AdminVoidConsumptionButton } from '@/components/admin/admin-void-consumption-button';
import { AdminReversePaymentButton } from '@/components/admin/admin-reverse-payment-button';
import { Card } from '@/components/ui/card';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { avatarUploadUrl } from '@/lib/avatars/upload-url';
import { requireRole } from '@/lib/auth/session';
import { memberBalance, paymentsTotal } from '@/lib/balance/calculate';
import { roleSatisfies } from '@/lib/permissions';
import { db } from '@/lib/db/client';
import { members } from '@/lib/db/schema/members';
import { getMemberChargesForAdmin, getMemberTabForAdmin } from '@/lib/db/queries/consumption';
import { getMemberConfirmedPayments } from '@/lib/db/queries/payments';
import { getOpenSessionForClub } from '@/lib/db/queries/sessions';
import { formatMoney } from '@/lib/format';

// US4 — per-member balance detail + the treasurer's manual-payment form.
export default async function MemberBalanceDetailPage({
  params,
}: {
  params: Promise<{ locale: string; memberId: string }>;
}) {
  const { locale, memberId } = await params;
  setRequestLocale(locale);

  const ctx = await requireRole('treasurer', 'club_admin');
  const t = await getTranslations('treasurer');
  const tHome = await getTranslations('home');
  const tAdmin = await getTranslations('admin');
  const tTab = await getTranslations('tab');
  const member = await db.query.members.findFirst({
    where: and(eq(members.id, memberId), eq(members.clubId, ctx.club.id)),
  });
  if (!member) notFound();

  // Spec 031 — correction controls are club_admin-only, even though this
  // page is also reachable by treasurers (who use the payment form).
  const isAdmin = roleSatisfies(ctx.member.role, 'club_admin');

  const openSession = await getOpenSessionForClub(ctx.club.id);
  const [balanceMinor, pendingMinor, tab, charges, confirmedPayments] = await Promise.all([
    memberBalance(member.id),
    paymentsTotal(member.id, 'claimed'),
    getMemberTabForAdmin({ memberId: member.id, session: openSession }),
    isAdmin ? getMemberChargesForAdmin(member.id, ctx.club.id) : Promise.resolve([]),
    isAdmin ? getMemberConfirmedPayments(member.id, ctx.club.id) : Promise.resolve([]),
  ]);
  const { currencyCode, defaultLocale } = ctx.club;
  const dateFmt = new Intl.DateTimeFormat(defaultLocale, { dateStyle: 'medium' });

  return (
    <main className="mx-auto max-w-md p-5">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <MemberAvatar
            avatarKey={member.avatarKey}
            displayName={member.displayName}
            uploadUrl={avatarUploadUrl(member.id, member.avatarUploadAt)}
            className="h-12 w-12"
          />
          <h1 className="text-2xl font-bold">{member.displayName}</h1>
        </div>
        <Link href={'/admin/balances' as Route} className="text-primary text-sm underline">
          ← {t('balancesTitle')}
        </Link>
      </header>

      <Card className="mb-6 p-6">
        <div className="text-muted-foreground text-sm">{tHome('outstandingBalance')}</div>
        <div className="mt-1 text-3xl font-bold">
          {formatMoney(balanceMinor, currencyCode, defaultLocale)}
        </div>
        {pendingMinor > 0n ? (
          <div className="text-muted-foreground mt-1 text-sm">
            {t('pendingConfirmation', {
              amount: formatMoney(pendingMinor, currencyCode, defaultLocale),
            })}
          </div>
        ) : null}
      </Card>

      {/* Spec 019 FR-007 follow-up: per-member origin distinction on
          every consumption-listing screen. Reuses <TabEntryRow /> so
          the treasurer sees the same self / on-behalf / won-bet /
          lost-bet attribution the member sees on /tab. Scoped to the
          current open session (older entries live in the member's
          /history); admin has no undo affordance from this view. */}
      {openSession && tab.entries.length > 0 ? (
        <section className="mb-6">
          {/* Neutral, session-scoped heading — this is the member's tab
              viewed by an admin, so no "Moje" possessive, and no
              dangling "·" when the session is unnamed. */}
          <h2 className="mb-2 text-sm font-medium">{tTab('sessionTotal')}</h2>
          <ul className="flex flex-col gap-2">
            {tab.entries.map((entry) => (
              <TabEntryRow
                key={`${entry.kind}-${entry.id}`}
                entry={entry}
                currencyCode={currencyCode}
                locale={defaultLocale}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {/* Spec 031 — admin data correction. Club-admin-only surgical
          controls: void any of the member's charges (all sessions) and
          reverse a confirmed payment. Both reuse the existing audited
          actions (compensating rows; balance invariant preserved). */}
      {isAdmin && charges.length > 0 ? (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-medium">{tAdmin('correctChargesHeading')}</h2>
          <ul className="flex flex-col gap-2">
            {charges.map((c) => (
              <li key={c.consumptionId}>
                <Card className="flex flex-row items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{c.beerTypeName}</div>
                    <div className="text-muted-foreground text-xs">
                      {dateFmt.format(c.createdAt)} ·{' '}
                      {formatMoney(c.unitPriceMinor, currencyCode, defaultLocale)}
                    </div>
                  </div>
                  <AdminVoidConsumptionButton
                    consumptionId={c.consumptionId}
                    label={c.beerTypeName}
                  />
                </Card>
              </li>
            ))}
          </ul>
          {charges.length >= 50 ? (
            <p className="text-muted-foreground mt-2 text-xs">{tAdmin('listCap', { count: 50 })}</p>
          ) : null}
        </section>
      ) : null}

      {isAdmin && confirmedPayments.length > 0 ? (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-medium">{tAdmin('reversePaymentsHeading')}</h2>
          <ul className="flex flex-col gap-2">
            {confirmedPayments.map((p) => (
              <li key={p.paymentId}>
                <Card className="flex flex-row items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">
                      {formatMoney(p.amountMinor, currencyCode, defaultLocale)}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {dateFmt.format(p.createdAt)}
                    </div>
                  </div>
                  <AdminReversePaymentButton
                    paymentId={p.paymentId}
                    amountLabel={formatMoney(p.amountMinor, currencyCode, defaultLocale)}
                  />
                </Card>
              </li>
            ))}
          </ul>
          {confirmedPayments.length >= 50 ? (
            <p className="text-muted-foreground mt-2 text-xs">{tAdmin('listCap', { count: 50 })}</p>
          ) : null}
        </section>
      ) : null}

      <Card className="p-4">
        <h2 className="mb-3 text-lg font-semibold">{tAdmin('recordPaymentHeading')}</h2>
        <ManualPaymentForm memberId={member.id} currencyCode={currencyCode} />
      </Card>
    </main>
  );
}

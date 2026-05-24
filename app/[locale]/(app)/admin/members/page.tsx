import type { Route } from 'next';
import { Link } from '@/lib/i18n/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { eq } from 'drizzle-orm';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { members } from '@/lib/db/schema/members';
import { getPendingInvitations } from '@/lib/db/queries/invitations';
import { InviteForm } from '@/components/admin/invite-form';

export default async function AdminMembersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const ctx = await requireRole('treasurer', 'club_admin');
  const t = await getTranslations('admin');
  const tRoles = await getTranslations('admin.roles');
  const tCommon = await getTranslations('common');

  const memberRows = await db
    .select()
    .from(members)
    .where(eq(members.clubId, ctx.club.id));

  const invitationRows = await getPendingInvitations(ctx.club.id);
  const dateFmt = new Intl.DateTimeFormat(ctx.club.defaultLocale, { dateStyle: 'medium' });

  return (
    <main className="mx-auto max-w-3xl p-5">
      <Link
        href={'/admin' as Route}
        className="text-muted-foreground hover:text-foreground mb-4 inline-block text-sm underline"
      >
        ← {tCommon('back')}
      </Link>
      <h1 className="mb-6 text-2xl font-bold">{t('membersTitle')}</h1>

      <Card className="mb-6 p-4">
        <h2 className="mb-3 text-lg font-semibold">{t('inviteHeading')}</h2>
        <InviteForm />
      </Card>

      <h2 className="mb-3 text-lg font-semibold">
        {t('activeMembers', { count: memberRows.length })}
      </h2>
      <ul className="mb-6 flex flex-col gap-2">
        {memberRows.map((m) => (
          <li
            key={m.id}
            className="flex items-center justify-between rounded-md border p-3"
          >
            <div>
              <div className="font-medium">{m.displayName}</div>
              <div className="text-muted-foreground text-xs">{m.email}</div>
            </div>
            <Badge variant={m.role === 'club_admin' ? 'default' : 'secondary'}>
              {tRoles(m.role)}
            </Badge>
          </li>
        ))}
      </ul>

      <h2 className="mb-3 text-lg font-semibold">{t('recentInvitations')}</h2>
      <ul className="flex flex-col gap-2">
        {invitationRows.map((inv) => (
          <li
            key={inv.id}
            className="flex items-center justify-between rounded-md border p-3"
          >
            <div>
              <div className="font-medium">{inv.email}</div>
              <div className="text-muted-foreground text-xs">
                {t('invitedOn', {
                  role: tRoles(inv.role),
                  date: dateFmt.format(inv.createdAt),
                })}
              </div>
            </div>
            <Badge variant={inv.status === 'pending' ? 'secondary' : 'outline'}>
              {inv.status}
            </Badge>
          </li>
        ))}
        {invitationRows.length === 0 ? (
          <li className="text-muted-foreground p-3 text-center text-sm">
            {t('noInvitations')}
          </li>
        ) : null}
      </ul>
    </main>
  );
}

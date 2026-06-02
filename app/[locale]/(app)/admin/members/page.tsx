import type { Route } from 'next';
import { Link } from '@/lib/i18n/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { eq, sql } from 'drizzle-orm';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FilterList } from '@/components/ui/filter-list';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { MemberActionsMenu } from '@/components/admin/member-actions-menu';
import { requireRole } from '@/lib/auth/session';
import { avatarUploadUrl } from '@/lib/avatars/upload-url';
import { db } from '@/lib/db/client';
import { members } from '@/lib/db/schema/members';
import { getPendingInvitations } from '@/lib/db/queries/invitations';
import { InviteForm } from '@/components/admin/invite-form';
import { roleSatisfies } from '@/lib/permissions';
import { cn } from '@/lib/utils';

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
  const tStatus = await getTranslations('admin.invitationStatus');
  const tActions = await getTranslations('admin.memberActions');
  const tCommon = await getTranslations('common');
  const canManageMembers = roleSatisfies(ctx.member.role, 'club_admin');

  const memberRows = await db
    .select()
    .from(members)
    .where(eq(members.clubId, ctx.club.id))
    // Order by display name, falling back to email when the name is
    // blank (case-insensitive).
    .orderBy(
      sql`lower(coalesce(nullif(trim(${members.displayName}), ''), ${members.email}))`,
    );

  const invitationRows = await getPendingInvitations(ctx.club.id);
  const dateFmt = new Intl.DateTimeFormat(ctx.club.defaultLocale, { dateStyle: 'medium' });

  return (
    <main className="mx-auto max-w-md p-5">
      <header className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('membersTitle')}</h1>
        <Link
          href={'/admin' as Route}
          className="text-muted-foreground hover:text-foreground text-sm underline"
        >
          ← {tCommon('back')}
        </Link>
      </header>

      <Card className="mb-6 p-4">
        <h2 className="mb-3 text-lg font-semibold">{t('inviteHeading')}</h2>
        <InviteForm />
      </Card>

      <h2 className="mb-3 text-lg font-semibold">
        {t('activeMembers', { count: memberRows.length })}
      </h2>
      <div className="mb-6">
        <FilterList
          placeholder={tCommon('searchMember')}
          emptyText={tCommon('noMembersFound')}
          items={memberRows.map((m) => ({
            key: m.id,
            searchText: `${m.displayName} ${m.email}`,
            node: (
              <Card
                className={cn(
                  'flex flex-row items-center gap-3 p-3',
                  !m.isActive && 'opacity-60',
                )}
              >
                <MemberAvatar
                  avatarKey={m.avatarKey}
                  displayName={m.displayName}
                  uploadUrl={avatarUploadUrl(m.id, m.avatarUploadAt)}
                  className="h-10 w-10 text-xs"
                />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {m.displayName}
                    {!m.isActive ? (
                      <span className="text-muted-foreground ml-2 text-xs font-normal">
                        · {tActions('inactiveLabel')}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-muted-foreground text-xs">{m.email}</div>
                </div>
                <Badge variant={m.role === 'club_admin' ? 'default' : 'secondary'}>
                  {tRoles(m.role)}
                </Badge>
                {canManageMembers ? (
                  <MemberActionsMenu
                    memberId={m.id}
                    memberDisplayName={m.displayName}
                    currentRole={m.role}
                    isActive={m.isActive}
                    isSelf={m.id === ctx.member.id}
                  />
                ) : null}
              </Card>
            ),
          }))}
        />
      </div>

      <h2 className="mb-3 text-lg font-semibold">{t('recentInvitations')}</h2>
      <ul className="flex flex-col gap-2">
        {invitationRows.map((inv) => (
          <li key={inv.id}>
            <Card className="flex flex-row items-center justify-between gap-3 p-3">
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
              {tStatus(inv.status)}
            </Badge>
            </Card>
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

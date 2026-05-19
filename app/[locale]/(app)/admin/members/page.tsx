import { setRequestLocale } from 'next-intl/server';
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

  const memberRows = await db
    .select()
    .from(members)
    .where(eq(members.clubId, ctx.club.id));

  const invitationRows = await getPendingInvitations(ctx.club.id);

  return (
    <main className="mx-auto max-w-3xl p-4">
      <h1 className="mb-6 text-2xl font-bold">Members</h1>

      <Card className="mb-6 p-4">
        <h2 className="mb-3 text-lg font-semibold">Invite a new member</h2>
        <InviteForm />
      </Card>

      <h2 className="mb-3 text-lg font-semibold">Active members ({memberRows.length})</h2>
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
            <Badge variant={m.role === 'club_admin' ? 'default' : 'secondary'}>{m.role}</Badge>
          </li>
        ))}
      </ul>

      <h2 className="mb-3 text-lg font-semibold">Recent invitations</h2>
      <ul className="flex flex-col gap-2">
        {invitationRows.map((inv) => (
          <li
            key={inv.id}
            className="flex items-center justify-between rounded-md border p-3"
          >
            <div>
              <div className="font-medium">{inv.email}</div>
              <div className="text-muted-foreground text-xs">
                {inv.role} · invited {inv.createdAt.toISOString().slice(0, 10)}
              </div>
            </div>
            <Badge variant={inv.status === 'pending' ? 'secondary' : 'outline'}>
              {inv.status}
            </Badge>
          </li>
        ))}
        {invitationRows.length === 0 ? (
          <li className="text-muted-foreground p-3 text-center text-sm">
            No invitations yet.
          </li>
        ) : null}
      </ul>
    </main>
  );
}

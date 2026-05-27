import 'server-only';
import { and, desc, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { invitations, type Invitation } from '@/lib/db/schema/members';

/**
 * Look up an open invitation by its argon2id token-hash.
 * Returns null if not found, expired, or already accepted/revoked.
 */
export async function findOpenInvitationByTokenHash(tokenHash: string): Promise<Invitation | null> {
  const inv = await db.query.invitations.findFirst({
    where: and(eq(invitations.tokenHash, tokenHash), eq(invitations.status, 'pending')),
  });
  if (!inv) return null;
  if (inv.expiresAt.getTime() < Date.now()) return null;
  return inv;
}

export interface InvitationRow {
  id: string;
  email: string;
  role: Invitation['role'];
  status: Invitation['status'];
  createdAt: Date;
  expiresAt: Date;
  createdByDisplayName: string | null;
}

/**
 * Admin-members-page query: pending invitations only. Accepted
 * invitations are dropped from the waiting list — the new member
 * already shows up in the "Parta" members section above, so a
 * duplicate "Přijato" row here is just noise (user direction
 * 2026-05-27).
 */
export async function getPendingInvitations(clubId: string): Promise<InvitationRow[]> {
  const rows = await db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      status: invitations.status,
      createdAt: invitations.createdAt,
      expiresAt: invitations.expiresAt,
    })
    .from(invitations)
    .where(
      and(
        eq(invitations.clubId, clubId),
        eq(invitations.status, 'pending'),
      ),
    )
    .orderBy(desc(invitations.createdAt));

  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role,
    status: r.status,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    createdByDisplayName: null,
  }));
}

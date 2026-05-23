import 'server-only';
import { and, desc, eq, inArray } from 'drizzle-orm';

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
 * Admin-members-page query: pending invitations + recently accepted.
 */
export async function getPendingInvitations(clubId: string): Promise<InvitationRow[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      status: invitations.status,
      createdAt: invitations.createdAt,
      expiresAt: invitations.expiresAt,
      createdByUserId: invitations.createdByUserId,
      acceptedAt: invitations.acceptedAt,
    })
    .from(invitations)
    .where(
      and(
        eq(invitations.clubId, clubId),
        inArray(invitations.status, ['pending', 'accepted']),
      ),
    )
    .orderBy(desc(invitations.createdAt));

  // Filter out long-accepted invitations in JS (avoids a more complex WHERE clause).
  return rows
    .filter((r) => r.status === 'pending' || (r.acceptedAt && r.acceptedAt > thirtyDaysAgo))
    .map((r) => ({
      id: r.id,
      email: r.email,
      role: r.role,
      status: r.status,
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
      createdByDisplayName: null,
    }));
}

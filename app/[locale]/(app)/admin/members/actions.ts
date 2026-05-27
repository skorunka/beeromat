'use server';

import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { getLocale } from 'next-intl/server';

import { db } from '@/lib/db/client';
import { invitations, members } from '@/lib/db/schema/members';
import { requireRole } from '@/lib/auth/session';
import { sendInvitation } from '@/lib/email/mailer';
import { env } from '@/lib/env';
import type { Locale } from '@/lib/i18n/routing';
import type { Role } from '@/lib/permissions';

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 4,
} as const;

const DEFAULT_EXPIRES_DAYS = 14;

export type InviteResult =
  | { ok: true; invitationId: string }
  | { ok: false; code: 'ALREADY_MEMBER' | 'ALREADY_INVITED' | 'EMAIL_SEND_FAILED' };

/**
 * Issue an invitation: generate a random token, store its hash, dispatch
 * the invitation email via Resend.
 *
 * Token hashing: we reuse argon2id (via hashPin's variant) for the token
 * hash so we have a single hashing primitive on the server. The token
 * itself is 32 bytes base64url — long enough that brute-forcing the
 * hashed lookup is infeasible.
 */
export async function inviteMemberAction(input: {
  email: string;
  role: Role;
  expiresInDays?: number;
}): Promise<InviteResult> {
  const ctx = await requireRole('treasurer', 'club_admin');
  const email = input.email.trim().toLowerCase();

  // Already a member of THIS club? Spec 027 — query is scoped to
  // the caller's club so this check doesn't leak whether the email
  // is registered in any other club. A user belonging to club B
  // can be invited to club A as a brand-new member of A.
  const existingMember = await db.query.members.findFirst({
    where: and(eq(members.email, email), eq(members.clubId, ctx.club.id)),
  });
  if (existingMember) {
    return { ok: false, code: 'ALREADY_MEMBER' };
  }

  // Already invited (open invitation) to THIS club? Same scoping.
  const existingInvite = await db.query.invitations.findFirst({
    where: and(eq(invitations.email, email), eq(invitations.clubId, ctx.club.id)),
  });
  if (existingInvite && existingInvite.status === 'pending') {
    return { ok: false, code: 'ALREADY_INVITED' };
  }

  // Generate raw token and store its hash.
  const rawToken = randomBytes(32).toString('base64url');
  const argon2Hash = await argon2.hash(rawToken, ARGON2_OPTIONS);

  const expiresAt = new Date(
    Date.now() + (input.expiresInDays ?? DEFAULT_EXPIRES_DAYS) * 24 * 60 * 60 * 1000,
  );

  const [created] = await db
    .insert(invitations)
    .values({
      clubId: ctx.club.id,
      email,
      role: input.role,
      tokenHash: argon2Hash,
      expiresAt,
      createdByUserId: ctx.user.id,
    })
    .returning();
  if (!created) throw new Error('Failed to create invitation');

  // Dispatch email. Spec 007 FR-006: thread the admin's request locale
  // so the invitation email renders in the admin's language (the v1
  // assumption is that admin and invitee share a club working language).
  // .catch(() => undefined) is the seatbelt — the mailer's own fallback
  // (normalizeLocale → routing.defaultLocale) handles failure.
  const locale = (await getLocale().catch(() => undefined)) as Locale | undefined;
  try {
    const url = `${env.BETTER_AUTH_URL}/invitation/${rawToken}`;
    await sendInvitation({
      to: email,
      inviterName: ctx.member.displayName,
      clubName: ctx.club.name,
      url,
      locale,
    });
  } catch (err) {
    console.error('[invite] email dispatch failed', err);
    return { ok: false, code: 'EMAIL_SEND_FAILED' };
  }

  revalidatePath('/admin/members');
  return { ok: true, invitationId: created.id };
}

// Change a member's role. club_admin only; can't change own role
// (prevents self-lockout — the only way to remove the last admin
// is via direct DB access, by design).
export type ChangeMemberRoleResult =
  | { ok: true }
  | { ok: false; code: 'NOT_FOUND' | 'CANT_SELF_MODIFY' | 'CROSS_CLUB' };

export async function changeMemberRoleAction(input: {
  memberId: string;
  role: Role;
}): Promise<ChangeMemberRoleResult> {
  const ctx = await requireRole('club_admin');
  if (input.memberId === ctx.member.id) {
    return { ok: false, code: 'CANT_SELF_MODIFY' };
  }
  const target = await db.query.members.findFirst({
    where: eq(members.id, input.memberId),
  });
  if (!target) return { ok: false, code: 'NOT_FOUND' };
  if (target.clubId !== ctx.club.id) return { ok: false, code: 'CROSS_CLUB' };

  await db
    .update(members)
    .set({ role: input.role })
    .where(eq(members.id, target.id));
  revalidatePath('/admin/members');
  return { ok: true };
}

// Block (deactivate) or unblock a member. Soft state — sets
// members.isActive — so consumption / payment history is preserved.
// Inactive members can't sign in via magic link or unlock devices,
// but their old data stays intact for the treasurer's books.
// club_admin only; self-modify rejected for the same reason as
// changeMemberRoleAction.
export type SetMemberActiveResult =
  | { ok: true }
  | { ok: false; code: 'NOT_FOUND' | 'CANT_SELF_MODIFY' | 'CROSS_CLUB' };

export async function setMemberActiveAction(input: {
  memberId: string;
  isActive: boolean;
}): Promise<SetMemberActiveResult> {
  const ctx = await requireRole('club_admin');
  if (input.memberId === ctx.member.id) {
    return { ok: false, code: 'CANT_SELF_MODIFY' };
  }
  const target = await db.query.members.findFirst({
    where: eq(members.id, input.memberId),
  });
  if (!target) return { ok: false, code: 'NOT_FOUND' };
  if (target.clubId !== ctx.club.id) return { ok: false, code: 'CROSS_CLUB' };

  await db
    .update(members)
    .set({ isActive: input.isActive })
    .where(eq(members.id, target.id));
  revalidatePath('/admin/members');
  revalidatePath('/admin/balances');
  return { ok: true };
}

export async function revokeInvitationAction(input: {
  invitationId: string;
}): Promise<{ ok: true } | { ok: false; code: 'NOT_FOUND' | 'INVALID_STATE' }> {
  const ctx = await requireRole('treasurer', 'club_admin');
  const inv = await db.query.invitations.findFirst({
    where: eq(invitations.id, input.invitationId),
  });
  if (!inv || inv.clubId !== ctx.club.id) return { ok: false, code: 'NOT_FOUND' };
  if (inv.status !== 'pending') return { ok: false, code: 'INVALID_STATE' };
  await db
    .update(invitations)
    .set({ status: 'revoked' })
    .where(eq(invitations.id, inv.id));
  revalidatePath('/admin/members');
  return { ok: true };
}

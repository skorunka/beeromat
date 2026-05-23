'use server';

import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
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

  // Already a member?
  const existingMember = await db.query.members.findFirst({
    where: eq(members.email, email),
  });
  if (existingMember && existingMember.clubId === ctx.club.id) {
    return { ok: false, code: 'ALREADY_MEMBER' };
  }

  // Already invited (open invitation)?
  const existingInvite = await db.query.invitations.findFirst({
    where: eq(invitations.email, email),
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

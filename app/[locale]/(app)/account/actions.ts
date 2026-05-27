'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema/auth';
import { members } from '@/lib/db/schema/members';
import { avatarUploads } from '@/lib/db/schema/avatar-uploads';
import { requireUnlocked } from '@/lib/auth/session';
import { accountSchema } from '@/lib/validation/account';
import {
  validateAvatarBytes,
  type AvatarValidationFailure,
} from '@/lib/avatars/upload-validate';

// Spec 010 — /account display-name update.
//
// Writes the trimmed display name to BOTH users.name (Better Auth's
// identity record, what some auth flows read) AND members.display_name
// (what most app surfaces render). The two MUST stay in lock-step,
// hence the single transaction (FR-006).

export type UpdateAccountResult =
  | { ok: true }
  | { ok: false; code: 'VALIDATION_FAILED'; fieldErrors: Record<string, string[]> };

export async function updateAccountAction(
  rawInput: unknown,
): Promise<UpdateAccountResult> {
  const parsed = accountSchema.safeParse(rawInput);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || '_root';
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { ok: false, code: 'VALIDATION_FAILED', fieldErrors };
  }

  const ctx = await requireUnlocked();
  const trimmed = parsed.data.displayName;

  await db.transaction(async (tx) => {
    await tx.update(users).set({ name: trimmed }).where(eq(users.id, ctx.user.id));
    await tx
      .update(members)
      .set({ displayName: trimmed })
      .where(eq(members.id, ctx.member.id));
  });

  // The home greeting + admin/members list + payment claims + history
  // all read displayName from the members row. revalidating the layout
  // tree invalidates every cached render so the new name shows on the
  // user's NEXT navigation.
  revalidatePath('/', 'layout');

  return { ok: true };
}

// Spec 020 — pick an avatar (or clear back to initials). Per-club
// seat: writes to ctx.member.avatarKey only; no cross-club identity
// effect. See contracts/set-avatar.md for the contract.

import { isValidAvatarKey } from '@/lib/avatars/validate';
import type { AvatarKey } from '@/lib/avatars/palette';

export type SetAvatarResult =
  | { ok: true }
  | { ok: false; code: 'INVALID_KEY' | 'NO_MEMBERSHIP' };

export async function setAvatarAction(input: {
  avatarKey: AvatarKey | string | null;
}): Promise<SetAvatarResult> {
  // Defensive normalization: empty string → null. The picker never
  // sends '' but a manual API call might.
  const rawKey = input.avatarKey === '' ? null : input.avatarKey;
  if (rawKey !== null && !isValidAvatarKey(rawKey)) {
    return { ok: false, code: 'INVALID_KEY' };
  }
  const finalKey: AvatarKey | null = rawKey;

  const ctx = await requireUnlocked();
  // requireUnlocked already guarantees ctx.member exists; this guard
  // is belt-and-braces for the contract's NO_MEMBERSHIP failure code.
  if (!ctx.member) {
    return { ok: false, code: 'NO_MEMBERSHIP' };
  }

  // Spec 021 — picking a glyph or Default ALSO drops any existing
  // uploaded avatar so the glyph/default wins (FR-006). One tx so
  // the members row + avatar_uploads row stay in lockstep.
  await db.transaction(async (tx) => {
    await tx.delete(avatarUploads).where(eq(avatarUploads.memberId, ctx.member.id));
    await tx
      .update(members)
      .set({ avatarKey: finalKey, avatarUploadAt: null })
      .where(eq(members.id, ctx.member.id));
  });

  // Layout-level revalidation — the AppHeader renders the avatar in
  // every authenticated page, so the next navigation tick picks up
  // the new glyph everywhere.
  revalidatePath('/', 'layout');
  revalidatePath('/account');

  return { ok: true };
}

// Spec 021 — upload + remove the member's custom avatar image.
// Bytes land in the dedicated avatar_uploads table; members.avatar_upload_at
// mirrors avatar_uploads.updated_at as the renderer sentinel +
// cache-buster. See contracts/upload-avatar.md.

export type UploadAvatarResult =
  | { ok: true }
  | {
      ok: false;
      code: AvatarValidationFailure | 'NO_MEMBERSHIP';
    };

export async function uploadAvatarAction(input: {
  imageBase64: string;
  contentType: string;
}): Promise<UploadAvatarResult> {
  const ctx = await requireUnlocked();
  if (!ctx.member) {
    return { ok: false, code: 'NO_MEMBERSHIP' };
  }

  const bytes = Buffer.from(input.imageBase64, 'base64');
  const validation = validateAvatarBytes(bytes, input.contentType);
  if (!validation.ok) return validation;

  const now = new Date();
  await db.transaction(async (tx) => {
    // UPSERT — one row per member (UNIQUE constraint on member_id).
    await tx
      .insert(avatarUploads)
      .values({
        memberId: ctx.member.id,
        image: bytes,
        contentType: input.contentType,
        byteSize: bytes.length,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: avatarUploads.memberId,
        set: {
          image: bytes,
          contentType: input.contentType,
          byteSize: bytes.length,
          updatedAt: now,
        },
      });
    await tx
      .update(members)
      .set({ avatarUploadAt: now })
      .where(eq(members.id, ctx.member.id));
  });

  revalidatePath('/', 'layout');
  revalidatePath('/account');

  return { ok: true };
}

export type RemoveAvatarUploadResult =
  | { ok: true }
  | { ok: false; code: 'NO_MEMBERSHIP' };

export async function removeAvatarUploadAction(): Promise<RemoveAvatarUploadResult> {
  const ctx = await requireUnlocked();
  if (!ctx.member) {
    return { ok: false, code: 'NO_MEMBERSHIP' };
  }

  await db.transaction(async (tx) => {
    await tx.delete(avatarUploads).where(eq(avatarUploads.memberId, ctx.member.id));
    await tx
      .update(members)
      .set({ avatarUploadAt: null })
      .where(eq(members.id, ctx.member.id));
  });

  revalidatePath('/', 'layout');
  revalidatePath('/account');

  return { ok: true };
}

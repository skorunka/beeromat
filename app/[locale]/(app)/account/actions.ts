'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema/auth';
import { members } from '@/lib/db/schema/members';
import { requireUnlocked } from '@/lib/auth/session';
import { accountSchema } from '@/lib/validation/account';

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

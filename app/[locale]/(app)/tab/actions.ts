'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { db } from '@/lib/db/client';
import { requireUnlocked } from '@/lib/auth/session';
import { drinkSessions } from '@/lib/db/schema/sessions';
import { sessionTitleSchema } from '@/lib/validation/session-title';

export type SetSessionTitleResult =
  | { ok: true; title: string | null }
  | {
      ok: false;
      code: 'NOT_FOUND' | 'VALIDATION_FAILED';
      fieldErrors?: Record<string, string[]>;
    };

// Spec 022 — set or clear the human-readable title on a drink session.
// Any active member of the same club may edit any session (Q1 → A,
// Q2 → β). The WHERE club_id clause double-enforces tenancy: a
// cross-club edit matches no rows and returns NOT_FOUND (we don't
// distinguish FORBIDDEN to avoid leaking other clubs' session ids).
export async function setSessionTitleAction(input: {
  sessionId: string;
  title: string | null;
}): Promise<SetSessionTitleResult> {
  const ctx = await requireUnlocked();

  const parsed = sessionTitleSchema.safeParse(input.title ?? '');
  if (!parsed.success) {
    return {
      ok: false,
      code: 'VALIDATION_FAILED',
      fieldErrors: { title: parsed.error.issues.map((i) => i.message) },
    };
  }

  const next = parsed.data;
  const updated = await db
    .update(drinkSessions)
    .set({ title: next })
    .where(
      and(
        eq(drinkSessions.id, input.sessionId),
        eq(drinkSessions.clubId, ctx.club.id),
      ),
    )
    .returning({ id: drinkSessions.id });

  if (updated.length === 0) {
    return { ok: false, code: 'NOT_FOUND' };
  }

  revalidatePath('/');
  revalidatePath('/tab');
  revalidatePath('/history');
  revalidatePath(`/history/${input.sessionId}`);

  return { ok: true, title: next };
}

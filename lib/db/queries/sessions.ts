import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { drinkSessions, type DrinkSession } from '@/lib/db/schema/sessions';

/**
 * Find the single currently-open drink session for a club, or null.
 */
export async function getOpenSessionForClub(clubId: string): Promise<DrinkSession | null> {
  const session = await db.query.drinkSessions.findFirst({
    where: and(eq(drinkSessions.clubId, clubId), isNull(drinkSessions.endedAt)),
  });
  return session ?? null;
}

/**
 * Close the club's currently-open round (stamp endedAt + closedBy).
 * The next logged beer auto-opens a fresh round. Single guarded UPDATE
 * so a concurrent double-close is race-safe — the second call matches
 * 0 rows (endedAt already set) and returns NO_OPEN_ROUND.
 */
export async function closeOpenRoundTx(
  clubId: string,
  closedByUserId: string,
): Promise<{ ok: true } | { ok: false; code: 'NO_OPEN_ROUND' }> {
  const closed = await db
    .update(drinkSessions)
    .set({ endedAt: new Date(), closedByUserId })
    .where(and(eq(drinkSessions.clubId, clubId), isNull(drinkSessions.endedAt)))
    .returning({ id: drinkSessions.id });
  if (closed.length === 0) return { ok: false, code: 'NO_OPEN_ROUND' };
  return { ok: true };
}

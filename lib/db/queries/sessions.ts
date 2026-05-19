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
 * Find or auto-open a drink session for the club. Called by logBeer
 * when a member taps "log" and there's no current session.
 * Inserts inside the caller's transaction.
 */
export async function getOrCreateOpenSession(
  clubId: string,
  openedByUserId: string,
  defaultTitle: string,
): Promise<DrinkSession> {
  const existing = await getOpenSessionForClub(clubId);
  if (existing) return existing;

  const [inserted] = await db
    .insert(drinkSessions)
    .values({
      clubId,
      openedByUserId,
      title: defaultTitle,
      startedAt: new Date(),
    })
    .returning();

  if (!inserted) {
    throw new Error('Failed to auto-open drink session');
  }
  return inserted;
}

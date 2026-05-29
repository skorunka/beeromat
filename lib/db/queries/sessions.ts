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

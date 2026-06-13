import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTestDb, type TestDb } from '../helpers/db';

// Spec 035 — badges are recognised at write-time: logging across a threshold
// returns the actor's newly-unlocked keys, persists them, and (on-behalf)
// reconciles the absent target silently.

let testDb: TestDb;
vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

const ctxRef = {
  current: null as null | {
    user: { id: string };
    member: { id: string; role: string };
    club: { id: string; consumptionUndoWindowSeconds: number };
  },
};
vi.mock('@/lib/auth/session', () => ({
  requireUnlocked: async () => ctxRef.current!,
  requireMember: async () => ctxRef.current!,
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { logBeerAction, logBeerOnBehalfAction } from '@/app/[locale]/(app)/log/actions';
import { getEarnedBadges } from '@/lib/db/queries/achievements';
import { users } from '@/lib/db/schema/auth';
import { clubs } from '@/lib/db/schema/clubs';
import { members } from '@/lib/db/schema/members';
import { beerTypes } from '@/lib/db/schema/catalog';
import { drinkSessions } from '@/lib/db/schema/sessions';
import { consumptions } from '@/lib/db/schema/consumption';

async function mkMember(clubId: string, name: string) {
  const [u] = await testDb
    .insert(users)
    .values({ email: `${name}-${Math.random()}@x.test`, name })
    .returning();
  const [m] = await testDb
    .insert(members)
    .values({ clubId, userId: u!.id, email: u!.email, displayName: name, role: 'member' })
    .returning();
  return { userId: u!.id, memberId: m!.id };
}

async function setup() {
  const [club] = await testDb
    .insert(clubs)
    .values({ name: 'TK', currencyCode: 'CZK', defaultLocale: 'cs' })
    .returning();
  const a = await mkMember(club!.id, 'Adam');
  const [beer] = await testDb
    .insert(beerTypes)
    .values({ clubId: club!.id, name: 'Pilsner', unitPriceMinor: 40n, currentStock: 1000, createdByUserId: a.userId })
    .returning();
  const [session] = await testDb
    .insert(drinkSessions)
    .values({ clubId: club!.id, openedByUserId: a.userId, startedAt: new Date() })
    .returning();
  return { clubId: club!.id, beerId: beer!.id, sessionId: session!.id, a };
}

describe('award-on-action (spec 035)', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
  });

  it('logBeerAction across the 100th beer returns + persists Century Club', async () => {
    const { clubId, beerId, sessionId, a } = await setup();
    // 99 existing beers → the action logs the 100th.
    await testDb.insert(consumptions).values(
      Array.from({ length: 99 }, () => ({
        clubId,
        drinkSessionId: sessionId,
        memberId: a.memberId,
        beerTypeId: beerId,
        unitPriceMinorSnapshot: 40n,
        createdByUserId: a.userId,
      })),
    );
    ctxRef.current = {
      user: { id: a.userId },
      member: { id: a.memberId, role: 'member' },
      club: { id: clubId, consumptionUndoWindowSeconds: 600 },
    };

    const res = await logBeerAction({ beerTypeId: beerId });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.unlockedBadges).toContain('centuryClub');

    const earned = await getEarnedBadges({ clubId, memberId: a.memberId });
    expect(earned.map((e) => e.key)).toContain('centuryClub');
  });

  it('logBeerAction below the threshold unlocks nothing', async () => {
    const { clubId, beerId, sessionId, a } = await setup();
    await testDb.insert(consumptions).values(
      Array.from({ length: 10 }, () => ({
        clubId,
        drinkSessionId: sessionId,
        memberId: a.memberId,
        beerTypeId: beerId,
        unitPriceMinorSnapshot: 40n,
        createdByUserId: a.userId,
      })),
    );
    ctxRef.current = {
      user: { id: a.userId },
      member: { id: a.memberId, role: 'member' },
      club: { id: clubId, consumptionUndoWindowSeconds: 600 },
    };

    const res = await logBeerAction({ beerTypeId: beerId });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.unlockedBadges).toEqual([]);
  });

  it('on-behalf log reconciles the TARGET silently (actor gets no celebration)', async () => {
    const { clubId, beerId, sessionId, a } = await setup();
    const target = await mkMember(clubId, 'Bohuš');
    // Target already has 99 beers; the actor logs their 100th on their behalf.
    await testDb.insert(consumptions).values(
      Array.from({ length: 99 }, () => ({
        clubId,
        drinkSessionId: sessionId,
        memberId: target.memberId,
        beerTypeId: beerId,
        unitPriceMinorSnapshot: 40n,
        createdByUserId: a.userId,
      })),
    );
    ctxRef.current = {
      user: { id: a.userId },
      member: { id: a.memberId, role: 'member' },
      club: { id: clubId, consumptionUndoWindowSeconds: 600 },
    };

    const res = await logBeerOnBehalfAction({ beerTypeId: beerId, targetMemberId: target.memberId });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // Actor isn't celebrated (their own stats didn't change)…
    expect(res.unlockedBadges).toEqual([]);
    // …but the target's badge was persisted silently.
    const targetEarned = await getEarnedBadges({ clubId, memberId: target.memberId });
    expect(targetEarned.map((e) => e.key)).toContain('centuryClub');
  });
});

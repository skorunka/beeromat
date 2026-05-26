import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { makeTestDb, type TestDb } from '../helpers/db';

let testDb: TestDb;

vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

// Auth + member resolution stubbed per-test so we can simulate
// "the absent member is signing in" or "another member is
// trying to void".
const ctxRef = { current: null as null | {
  user: { id: string };
  member: { id: string; role: string };
  club: { id: string; consumptionUndoWindowSeconds: number };
} };
vi.mock('@/lib/auth/session', () => ({
  requireMember: async () => ctxRef.current!,
}));

// revalidatePath requires a Next.js request context that doesn't
// exist in Vitest integration; stub it for these tests.
vi.mock('next/cache', () => ({
  revalidatePath: () => {},
}));

// memberBalance() runs queries on the outer `db` while
// voidConsumptionAction's transaction is still open — PGlite
// deadlocks on this. Stub it; the authz logic we're verifying
// fires before this call anyway.
vi.mock('@/lib/balance/calculate', () => ({
  memberBalance: async () => 0n,
}));

import { voidConsumptionAction } from '@/app/[locale]/(app)/log/actions';

// Spec 019 T005a — verifies the extended voidConsumptionAction
// authz: the consumer can void their own on-behalf consumption
// (the new clause), but existing constraints are preserved
// (cross-member void, self-log outside window).

async function seedClubWithTwoMembersAndBeer() {
  const [userA] = await testDb
    .insert((await import('@/lib/db/schema/auth')).users)
    .values({ email: `a-${Date.now()}-${Math.random()}@example.test`, name: 'Alice' })
    .returning();
  const [userB] = await testDb
    .insert((await import('@/lib/db/schema/auth')).users)
    .values({ email: `b-${Date.now()}-${Math.random()}@example.test`, name: 'Bob' })
    .returning();
  if (!userA || !userB) throw new Error('seed users');

  const [club] = await testDb
    .insert((await import('@/lib/db/schema/clubs')).clubs)
    .values({ name: 'Test Club', currencyCode: 'CZK', defaultLocale: 'cs-CZ' })
    .returning();
  if (!club) throw new Error('seed club');

  const [memberA] = await testDb
    .insert((await import('@/lib/db/schema/members')).members)
    .values({ clubId: club.id, userId: userA.id, email: userA.email, displayName: 'Alice', role: 'member' })
    .returning();
  const [memberB] = await testDb
    .insert((await import('@/lib/db/schema/members')).members)
    .values({ clubId: club.id, userId: userB.id, email: userB.email, displayName: 'Bob', role: 'member' })
    .returning();
  if (!memberA || !memberB) throw new Error('seed members');

  const [session] = await testDb
    .insert((await import('@/lib/db/schema/sessions')).drinkSessions)
    .values({ clubId: club.id, openedByUserId: userA.id, startedAt: new Date() })
    .returning();
  if (!session) throw new Error('seed session');

  const [beer] = await testDb
    .insert((await import('@/lib/db/schema/catalog')).beerTypes)
    .values({
      clubId: club.id,
      name: 'Pilsner',
      unitPriceMinor: 5000n,
      currentStock: 100,
      createdByUserId: userA.id,
    })
    .returning();
  if (!beer) throw new Error('seed beer');

  return { club, userA, userB, memberA, memberB, session, beer };
}

async function seedConsumption(args: {
  clubId: string;
  sessionId: string;
  memberId: string;       // consumer
  beerId: string;
  loggerUserId: string;   // created_by_user_id
  createdAt?: Date;
}) {
  const { consumptions } = await import('@/lib/db/schema/consumption');
  const [c] = await testDb
    .insert(consumptions)
    .values({
      clubId: args.clubId,
      drinkSessionId: args.sessionId,
      memberId: args.memberId,
      beerTypeId: args.beerId,
      unitPriceMinorSnapshot: 5000n,
      createdByUserId: args.loggerUserId,
      ...(args.createdAt ? { createdAt: args.createdAt } : {}),
    })
    .returning();
  if (!c) throw new Error('seed consumption');
  return c;
}

describe('voidConsumptionAction extended authz (spec 019)', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
    ctxRef.current = null;
  });

  it('allows the consumer (absent member) to void their own on-behalf log', async () => {
    const { club, userA, userB, memberB, session, beer } = await seedClubWithTwoMembersAndBeer();
    // Alice (userA) logs on behalf of Bob (memberB).
    const consumption = await seedConsumption({
      clubId: club.id,
      sessionId: session.id,
      memberId: memberB.id,
      beerId: beer.id,
      loggerUserId: userA.id,
    });

    // Bob (the consumer) tries to void.
    ctxRef.current = {
      user: { id: userB.id },
      member: { id: memberB.id, role: 'member' },
      club: { id: club.id, consumptionUndoWindowSeconds: 300 },
    };
    const result = await voidConsumptionAction({ consumptionId: consumption.id });
    expect(result.ok).toBe(true);

    const { consumptionVoids } = await import('@/lib/db/schema/consumption');
    const voids = await testDb.select().from(consumptionVoids);
    expect(voids).toHaveLength(1);
  });

  it('still rejects the consumer voiding a self-logged consumption outside the undo window', async () => {
    const { club, userB, memberB, session, beer } = await seedClubWithTwoMembersAndBeer();
    // Bob (the consumer) logs for themselves — but the log is old (outside undo window).
    const ancient = new Date(Date.now() - 10 * 60 * 1000); // 10 min ago
    const consumption = await seedConsumption({
      clubId: club.id,
      sessionId: session.id,
      memberId: memberB.id,
      beerId: beer.id,
      loggerUserId: userB.id, // self-log: createdByUserId == consumer's user
      createdAt: ancient,
    });

    ctxRef.current = {
      user: { id: userB.id },
      member: { id: memberB.id, role: 'member' },
      club: { id: club.id, consumptionUndoWindowSeconds: 300 }, // 5 min
    };
    const result = await voidConsumptionAction({ consumptionId: consumption.id });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error();
    expect(result.code).toBe('FORBIDDEN');
  });

});

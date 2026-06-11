import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { makeTestDb, type TestDb } from '../helpers/db';

let testDb: TestDb;
vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

import { ensureOccurrences } from '@/lib/db/queries/events';
import { users } from '@/lib/db/schema/auth';
import { clubs } from '@/lib/db/schema/clubs';
import { eventOccurrences, eventSeries } from '@/lib/db/schema/events';

async function seed(isActive: 1 | 0 = 1) {
  const [club] = await testDb
    .insert(clubs)
    .values({ name: 'TC', currencyCode: 'CZK', defaultLocale: 'cs' })
    .returning();
  const [u] = await testDb
    .insert(users)
    .values({ email: `u-${Math.random()}@x.test`, name: 'A', emailVerified: true })
    .returning();
  const [series] = await testDb
    .insert(eventSeries)
    .values({
      clubId: club!.id,
      weekday: 2, // Tuesday
      startLocalTime: '17:00',
      placeLabel: 'Antuka',
      isActive,
      createdByUserId: u!.id,
    })
    .returning();
  return { club: club!, series: series! };
}

async function countOccurrences(clubId: string): Promise<number> {
  const rows = await testDb
    .select()
    .from(eventOccurrences)
    .where(eq(eventOccurrences.clubId, clubId));
  return rows.length;
}

describe('ensureOccurrences (spec 032)', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
  });

  it('generates the horizon for an active series, and is idempotent', async () => {
    const { club } = await seed(1);
    const now = new Date('2026-06-16T08:00:00Z');

    const created = await ensureOccurrences(now, club.id);
    expect(created).toBeGreaterThan(0);
    const afterFirst = await countOccurrences(club.id);
    expect(afterFirst).toBe(created);

    // Re-run: nothing new, count unchanged (idempotent).
    const createdAgain = await ensureOccurrences(now, club.id);
    expect(createdAgain).toBe(0);
    expect(await countOccurrences(club.id)).toBe(afterFirst);
  });

  it('generates nothing for an inactive series', async () => {
    const { club } = await seed(0);
    const created = await ensureOccurrences(new Date('2026-06-16T08:00:00Z'), club.id);
    expect(created).toBe(0);
    expect(await countOccurrences(club.id)).toBe(0);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTestDb, type TestDb } from '../helpers/db';

let testDb: TestDb;

vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

import { promoteFirstUserIfNeeded } from '@/lib/auth/bootstrap';
import { users } from '@/lib/db/schema/auth';
import { clubs } from '@/lib/db/schema/clubs';
import { members } from '@/lib/db/schema/members';

async function seedClub(db: TestDb) {
  const [club] = await db
    .insert(clubs)
    .values({ name: 'Seeded Club', currencyCode: 'CZK', defaultLocale: 'cs-CZ' })
    .returning();
  if (!club) throw new Error('seed club');
  return club;
}

async function seedUser(
  db: TestDb,
  email = `bootstrap-${Date.now()}-${Math.random()}@example.test`,
) {
  const [user] = await db
    .insert(users)
    .values({ email, name: email.split('@')[0] ?? email, emailVerified: true })
    .returning();
  if (!user) throw new Error('seed user');
  return user;
}

describe('promoteFirstUserIfNeeded — spec 008 bootstrap state machine', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
  });

  it('state A → B: empty members + seeded club → promotes first user to club_admin', async () => {
    await seedClub(testDb);
    const user = await seedUser(testDb, 'first@example.test');

    const result = await promoteFirstUserIfNeeded(user.id);

    expect(result).toEqual({ promoted: true });
    const memberRows = await testDb.select().from(members);
    expect(memberRows).toHaveLength(1);
    expect(memberRows[0]?.role).toBe('club_admin');
    expect(memberRows[0]?.userId).toBe(user.id);
  });

  it('state B idempotency: a second sign-in by the same user does not duplicate the member row', async () => {
    await seedClub(testDb);
    const user = await seedUser(testDb, 'pavel@example.test');

    const first = await promoteFirstUserIfNeeded(user.id);
    expect(first.promoted).toBe(true);

    const second = await promoteFirstUserIfNeeded(user.id);
    expect(second).toEqual({ promoted: false, reason: 'already-bootstrapped' });

    const memberRows = await testDb.select().from(members);
    expect(memberRows).toHaveLength(1);
  });

  it('state C: a subsequent unknown user (after bootstrap) does NOT get promoted', async () => {
    await seedClub(testDb);
    const firstUser = await seedUser(testDb, 'pavel@example.test');
    await promoteFirstUserIfNeeded(firstUser.id);

    const secondUser = await seedUser(testDb, 'stranger@example.test');
    const result = await promoteFirstUserIfNeeded(secondUser.id);

    expect(result).toEqual({ promoted: false, reason: 'already-bootstrapped' });
    const memberRows = await testDb.select().from(members);
    expect(memberRows).toHaveLength(1);
    expect(memberRows[0]?.userId).toBe(firstUser.id);
  });

  it('race safety: two parallel promotion calls against empty members produce exactly one club_admin row', async () => {
    await seedClub(testDb);
    const userA = await seedUser(testDb, 'a@example.test');
    const userB = await seedUser(testDb, 'b@example.test');

    const [resA, resB] = await Promise.all([
      promoteFirstUserIfNeeded(userA.id),
      promoteFirstUserIfNeeded(userB.id),
    ]);

    const promotedCount = [resA.promoted, resB.promoted].filter(Boolean).length;
    expect(promotedCount).toBe(1);

    const memberRows = await testDb.select().from(members);
    expect(memberRows).toHaveLength(1);
    expect(memberRows[0]?.role).toBe('club_admin');
  });

  it('no seeded club: returns no-seeded-club reason and does not insert', async () => {
    const user = await seedUser(testDb, 'orphan@example.test');

    const result = await promoteFirstUserIfNeeded(user.id);

    expect(result).toEqual({ promoted: false, reason: 'no-seeded-club' });
    const memberRows = await testDb.select().from(members);
    expect(memberRows).toHaveLength(0);
  });
});

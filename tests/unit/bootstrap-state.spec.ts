import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTestDb, type TestDb } from '../helpers/db';

let testDb: TestDb;

vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

import {
  invalidateFreshDeploymentCache,
  isFreshDeployment,
} from '@/lib/db/queries/bootstrap-state';
import { users } from '@/lib/db/schema/auth';
import { clubs } from '@/lib/db/schema/clubs';

describe('isFreshDeployment — spec 009 cache transitions', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
    // Reset module-level cache between tests so state from one test
    // doesn't leak into the next. The function's own public API.
    invalidateFreshDeploymentCache();
  });

  it('null → true: queries DB on first call against an empty deployment, returns true', async () => {
    const fresh = await isFreshDeployment();
    expect(fresh).toBe(true);
  });

  it('null → false: queries DB, caches false when a clubs row exists', async () => {
    await testDb.insert(clubs).values({
      name: 'Seeded Club',
      currencyCode: 'CZK',
      defaultLocale: 'cs',
    });

    const fresh = await isFreshDeployment();
    expect(fresh).toBe(false);
  });

  it('null → false: a users row alone also flips the signal', async () => {
    await testDb.insert(users).values({
      email: 'someone@example.test',
      name: 'someone',
      emailVerified: false,
    });

    const fresh = await isFreshDeployment();
    expect(fresh).toBe(false);
  });

  it('sticky-false: after observing false, a subsequent call returns false WITHOUT re-querying', async () => {
    // Seed the populated state, observe false.
    await testDb.insert(clubs).values({
      name: 'Seeded Club',
      currencyCode: 'CZK',
      defaultLocale: 'cs',
    });
    expect(await isFreshDeployment()).toBe(false);

    // Now wipe the table — in real life impossible, here we forge
    // the corner case to prove the sticky cache wins over reality.
    await testDb.delete(clubs);

    // Cache still says false; the function does NOT re-query.
    expect(await isFreshDeployment()).toBe(false);
  });

  it('invalidate resets the cache; next call re-queries', async () => {
    await testDb.insert(clubs).values({
      name: 'Seeded Club',
      currencyCode: 'CZK',
      defaultLocale: 'cs',
    });
    expect(await isFreshDeployment()).toBe(false);

    // Wipe + invalidate — proves the cache is what was making it false,
    // not a stale query result.
    await testDb.delete(clubs);
    invalidateFreshDeploymentCache();

    expect(await isFreshDeployment()).toBe(true);
  });
});

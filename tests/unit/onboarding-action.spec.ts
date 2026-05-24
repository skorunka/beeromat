import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTestDb, type TestDb } from '../helpers/db';

let testDb: TestDb;

vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

import { createClubAndAdminUserTx } from '@/lib/auth/bootstrap';
import { users } from '@/lib/db/schema/auth';
import { clubs, clubBankingProfiles } from '@/lib/db/schema/clubs';

const validInput = {
  clubName: 'Tenisový klub Šafařík',
  currencyCode: 'CZK',
  defaultLocale: 'cs' as const,
  adminEmail: 'pavel@example.test',
};

describe('createClubAndAdminUserTx — spec 009 wizard transaction', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
  });

  it('state X → A: inserts clubs + banking profile + user with emailVerified=false', async () => {
    const result = await createClubAndAdminUserTx(validInput);

    expect(result.kind).toBe('inserted');
    if (result.kind !== 'inserted') return;

    const clubRows = await testDb.select().from(clubs);
    expect(clubRows).toHaveLength(1);
    expect(clubRows[0]).toMatchObject({
      id: result.clubId,
      name: validInput.clubName,
      currencyCode: 'CZK',
      defaultLocale: 'cs',
    });

    const bankingRows = await testDb.select().from(clubBankingProfiles);
    expect(bankingRows).toHaveLength(1);
    expect(bankingRows[0]?.clubId).toBe(result.clubId);
    expect(bankingRows[0]?.iban).toBeNull();

    const userRows = await testDb.select().from(users);
    expect(userRows).toHaveLength(1);
    expect(userRows[0]).toMatchObject({
      id: result.userId,
      email: 'pavel@example.test',
      emailVerified: false,
    });
  });

  it('FR-012 — state already populated: returns already-complete and inserts nothing', async () => {
    // Pre-seed a clubs row to violate the X precondition.
    await testDb
      .insert(clubs)
      .values({ name: 'Existing', currencyCode: 'EUR', defaultLocale: 'cs' });

    const result = await createClubAndAdminUserTx(validInput);

    expect(result).toEqual({ kind: 'already-complete' });
    expect(await testDb.select().from(clubs)).toHaveLength(1);
    expect(await testDb.select().from(users)).toHaveLength(0);
  });

  it('FR-012 — only users populated (clubs empty): also blocks bootstrap', async () => {
    // Edge case: spec 008's pre-create in requestMagicLinkAction wrote
    // a users row but the wizard never ran. Bootstrap must still
    // refuse — the deployment is no longer truly fresh.
    await testDb.insert(users).values({
      email: 'stranger@example.test',
      name: 'stranger',
      emailVerified: false,
    });

    const result = await createClubAndAdminUserTx(validInput);

    expect(result).toEqual({ kind: 'already-complete' });
    expect(await testDb.select().from(clubs)).toHaveLength(0);
    expect(await testDb.select().from(users)).toHaveLength(1);
  });

  it('race safety: two parallel calls produce exactly one successful insert', async () => {
    const otherInput = {
      ...validInput,
      clubName: 'Other Club',
      adminEmail: 'other@example.test',
    };

    const [resA, resB] = await Promise.all([
      createClubAndAdminUserTx(validInput),
      createClubAndAdminUserTx(otherInput),
    ]);

    const insertedCount = [resA.kind, resB.kind].filter((k) => k === 'inserted').length;
    expect(insertedCount).toBe(1);

    const clubRows = await testDb.select().from(clubs);
    expect(clubRows).toHaveLength(1);
    const userRows = await testDb.select().from(users);
    expect(userRows).toHaveLength(1);
  });
});

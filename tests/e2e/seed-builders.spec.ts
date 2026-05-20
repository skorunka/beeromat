import { sql } from 'drizzle-orm';

import { test, expect } from './fixtures/test';

// Verify chain link 4: the parameterized seed API + base fixture.
//
// Proves:
//   1. The builders compose a full scenario (club → member → beer →
//      session → consumption) with correct foreign keys.
//   2. The `seed` fixture truncates before each test — one test's rows
//      never leak into the next (requirement #5: per-test state).

test.describe('@chain-link-4 seed builders', () => {
  test('compose a full scenario with correct foreign keys', async ({ seed }) => {
    const club = await seed.club({ name: 'TK Test' });
    const { member, user } = await seed.member({ clubId: club.id, role: 'club_admin' });
    const beer = await seed.beerType({
      clubId: club.id,
      createdByUserId: user.id,
      name: 'Pilsner Urquell',
      unitPriceMinor: 5200n,
    });
    const session = await seed.drinkSession({ clubId: club.id, openedByUserId: user.id });
    const consumption = await seed.consumption({
      clubId: club.id,
      drinkSessionId: session.id,
      memberId: member.id,
      beerTypeId: beer.id,
      createdByUserId: user.id,
      unitPriceMinorSnapshot: 5200n,
    });

    expect(club.name).toBe('TK Test');
    expect(member.clubId).toBe(club.id);
    expect(member.role).toBe('club_admin');
    expect(beer.unitPriceMinor).toBe(5200n);
    expect(session.clubId).toBe(club.id);
    expect(consumption.drinkSessionId).toBe(session.id);
    expect(consumption.memberId).toBe(member.id);
    expect(consumption.beerTypeId).toBe(beer.id);
  });

  test('each test starts from an empty database', async ({ seed }) => {
    // If the previous test's rows had leaked, this count would be > 0
    // before we seed anything.
    const before = await seed.db.execute<{ count: string }>(
      sql.raw('SELECT count(*)::text AS count FROM clubs'),
    );
    expect(before.rows[0]?.count).toBe('0');

    await seed.club();
    const after = await seed.db.execute<{ count: string }>(
      sql.raw('SELECT count(*)::text AS count FROM clubs'),
    );
    expect(after.rows[0]?.count).toBe('1');
  });
});

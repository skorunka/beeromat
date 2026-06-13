import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTestDb, type TestDb } from '../helpers/db';

let testDb: TestDb;

vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

// Spec 031 — admin data correction reuses already-tested actions
// (voidConsumptionAction, voidConfirmedPaymentAction); their behaviour
// and the balance invariant are covered by their own integration tests.
// The only NEW DB code here is the two admin listing queries, so per the
// testing pyramid that is all this integration spec covers — the
// correction controls themselves are verified at the component layer.
import { getMemberChargesForAdmin } from '@/lib/db/queries/consumption';
import { getMemberConfirmedPayments } from '@/lib/db/queries/payments';
import { users } from '@/lib/db/schema/auth';
import { clubs } from '@/lib/db/schema/clubs';
import { members } from '@/lib/db/schema/members';
import { beerTypes } from '@/lib/db/schema/catalog';
import { consumptions, consumptionVoids } from '@/lib/db/schema/consumption';
import { drinkSessions } from '@/lib/db/schema/sessions';
import { payments } from '@/lib/db/schema/payments';

const PRICE = 4500n;

async function mkUser(name: string) {
  const [u] = await testDb
    .insert(users)
    .values({ email: `${name}-${Math.random()}@x.test`, name, emailVerified: true })
    .returning();
  return u!;
}

async function seedClub(name: string) {
  const [club] = await testDb
    .insert(clubs)
    .values({ name, currencyCode: 'CZK', defaultLocale: 'cs' })
    .returning();
  const adminUser = await mkUser(`${name}-admin`);
  const targetUser = await mkUser(`${name}-target`);
  const [target] = await testDb
    .insert(members)
    .values({
      clubId: club!.id,
      userId: targetUser.id,
      email: targetUser.email,
      displayName: `${name}-target`,
      role: 'member',
      acceptedInvitationAt: new Date(),
    })
    .returning();
  const [beer] = await testDb
    .insert(beerTypes)
    .values({
      clubId: club!.id,
      name: 'Pilsner',
      unitPriceMinor: PRICE,
      currentStock: 100,
      createdByUserId: adminUser.id,
    })
    .returning();
  const [session] = await testDb
    .insert(drinkSessions)
    .values({ clubId: club!.id, startedAt: new Date(), openedByUserId: adminUser.id })
    .returning();
  return { club: club!, user: adminUser, target: target!, beer: beer!, session: session! };
}

type Seed = Awaited<ReturnType<typeof seedClub>>;

async function addConsumption(c: Seed) {
  const [row] = await testDb
    .insert(consumptions)
    .values({
      clubId: c.club.id,
      drinkSessionId: c.session.id,
      memberId: c.target.id,
      beerTypeId: c.beer.id,
      unitPriceMinorSnapshot: PRICE,
      createdByUserId: c.user.id,
    })
    .returning();
  return row!;
}

describe('admin data-correction listing queries (spec 031)', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
  });

  it('getMemberChargesForAdmin: own consumptions incl. voided (flagged), club-scoped', async () => {
    const a = await seedClub('A');
    const b = await seedClub('B');
    const c1 = await addConsumption(a);
    await addConsumption(a);
    await addConsumption(b); // other club — must be excluded
    await testDb
      .insert(consumptionVoids)
      .values({ clubId: a.club.id, consumptionId: c1.id, voidedByUserId: a.user.id });

    const charges = await getMemberChargesForAdmin(a.target.id, a.club.id);
    // Both A rows listed (voided ones must remain deletable — a voided
    // consumption still lingers as a greyed ghost); B excluded.
    expect(charges).toHaveLength(2);
    expect(charges.filter((c) => c.voided)).toHaveLength(1);
    expect(charges.every((c) => c.beerTypeName === 'Pilsner')).toBe(true);
  });

  it('getMemberConfirmedPayments: confirmed only, club-scoped', async () => {
    const a = await seedClub('A');
    const b = await seedClub('B');
    await testDb.insert(payments).values({
      clubId: a.club.id,
      memberId: a.target.id,
      amountMinor: PRICE,
      currencyCode: 'CZK',
      status: 'confirmed',
      origin: 'treasurer_initiated',
      createdByUserId: a.user.id,
    });
    await testDb.insert(payments).values({
      clubId: a.club.id,
      memberId: a.target.id,
      amountMinor: 999n,
      currencyCode: 'CZK',
      status: 'claimed', // not confirmed — excluded
      origin: 'member_initiated',
      createdByUserId: a.user.id,
    });
    await testDb.insert(payments).values({
      clubId: b.club.id,
      memberId: b.target.id,
      amountMinor: PRICE,
      currencyCode: 'CZK',
      status: 'confirmed', // other club — excluded
      origin: 'treasurer_initiated',
      createdByUserId: b.user.id,
    });

    const confirmed = await getMemberConfirmedPayments(a.target.id, a.club.id);
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0]!.amountMinor).toBe(PRICE);
  });
});

import { users } from '@/lib/db/schema/auth';
import { beerTypes } from '@/lib/db/schema/catalog';
import { clubBankingProfiles, clubs } from '@/lib/db/schema/clubs';
import { consumptions } from '@/lib/db/schema/consumption';
import { members } from '@/lib/db/schema/members';
import { drinkSessions } from '@/lib/db/schema/sessions';
import type {
  BeerType,
  Club,
  ClubBankingProfile,
  Consumption,
  DrinkSession,
  Member,
  User,
} from '@/lib/db/schema';

import type { Db } from './test-db';

// Composable seed builders. Each takes a live test Db and an args
// object; defaults fill the rest. Specs compose exactly the state a
// scenario needs (requirement #5 — "seed the DB to a specific state
// per test"). Bound onto the `seed` Playwright fixture in test.ts.
//
// Every builder lives under tests/ — test infrastructure, never
// imported by production code.

// Monotonic counter for unique-by-default values within a run.
let seq = 0;
const next = (): number => ++seq;

export async function seedClub(db: Db, overrides: Partial<typeof clubs.$inferInsert> = {}): Promise<Club> {
  const n = next();
  const [row] = await db
    .insert(clubs)
    .values({
      name: `Test Club ${n}`,
      currencyCode: 'CZK',
      defaultLocale: 'cs-CZ',
      ...overrides,
    })
    .returning();
  if (!row) throw new Error('seedClub: insert returned no row');
  return row;
}

export async function seedBankingProfile(
  db: Db,
  args: { clubId: string } & Partial<typeof clubBankingProfiles.$inferInsert>,
): Promise<ClubBankingProfile> {
  const [row] = await db
    .insert(clubBankingProfiles)
    .values({
      iban: 'CZ7603000000000076327632',
      accountHolderName: 'Test Club Treasurer',
      ...args,
    })
    .returning();
  if (!row) throw new Error('seedBankingProfile: insert returned no row');
  return row;
}

export async function seedMember(
  db: Db,
  args: {
    clubId: string;
    role?: Member['role'];
    email?: string;
    displayName?: string;
    isActive?: boolean;
    createdByUserId?: string;
  },
): Promise<{ user: User; member: Member }> {
  const n = next();
  const email = args.email ?? `member${n}@example.test`;
  const displayName = args.displayName ?? `Member ${n}`;

  const [user] = await db
    .insert(users)
    .values({ email, name: displayName, emailVerified: true })
    .returning();
  if (!user) throw new Error('seedMember: user insert returned no row');

  const [member] = await db
    .insert(members)
    .values({
      clubId: args.clubId,
      userId: user.id,
      email,
      displayName,
      role: args.role ?? 'member',
      isActive: args.isActive ?? true,
      acceptedInvitationAt: new Date(),
      createdByUserId: args.createdByUserId ?? null,
    })
    .returning();
  if (!member) throw new Error('seedMember: member insert returned no row');

  return { user, member };
}

export async function seedBeerType(
  db: Db,
  args: {
    clubId: string;
    createdByUserId: string;
    name?: string;
    unitPriceMinor?: bigint;
    currentStock?: number;
    lowStockThreshold?: number;
    isArchived?: boolean;
    displayOrder?: number;
  },
): Promise<BeerType> {
  const n = next();
  const [row] = await db
    .insert(beerTypes)
    .values({
      clubId: args.clubId,
      createdByUserId: args.createdByUserId,
      name: args.name ?? `Beer ${n}`,
      unitPriceMinor: args.unitPriceMinor ?? 5000n,
      currentStock: args.currentStock ?? 100,
      lowStockThreshold: args.lowStockThreshold ?? 5,
      isArchived: args.isArchived ?? false,
      displayOrder: args.displayOrder ?? n,
    })
    .returning();
  if (!row) throw new Error('seedBeerType: insert returned no row');
  return row;
}

export async function seedDrinkSession(
  db: Db,
  args: {
    clubId: string;
    openedByUserId: string;
    title?: string;
    startedAt?: Date;
    endedAt?: Date | null;
    closedByUserId?: string | null;
  },
): Promise<DrinkSession> {
  const [row] = await db
    .insert(drinkSessions)
    .values({
      clubId: args.clubId,
      openedByUserId: args.openedByUserId,
      title: args.title ?? `Session ${next()}`,
      startedAt: args.startedAt ?? new Date(),
      endedAt: args.endedAt ?? null,
      closedByUserId: args.closedByUserId ?? null,
    })
    .returning();
  if (!row) throw new Error('seedDrinkSession: insert returned no row');
  return row;
}

export async function seedConsumption(
  db: Db,
  args: {
    clubId: string;
    drinkSessionId: string;
    memberId: string;
    beerTypeId: string;
    createdByUserId: string;
    unitPriceMinorSnapshot?: bigint;
  },
): Promise<Consumption> {
  const [row] = await db
    .insert(consumptions)
    .values({
      clubId: args.clubId,
      drinkSessionId: args.drinkSessionId,
      memberId: args.memberId,
      beerTypeId: args.beerTypeId,
      createdByUserId: args.createdByUserId,
      unitPriceMinorSnapshot: args.unitPriceMinorSnapshot ?? 5000n,
    })
    .returning();
  if (!row) throw new Error('seedConsumption: insert returned no row');
  return row;
}

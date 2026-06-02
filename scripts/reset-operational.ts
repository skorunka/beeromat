/**
 * Reset OPERATIONAL data to a clean sheet for testing, while KEEPING the
 * club, its banking profile, and all club_admin members (so your login +
 * admin access survive). Idempotent: every run yields the same state —
 *
 *   • all transactional data wiped (consumptions, payments, matches, bet
 *     transfers, drink sessions, stock changes, invitations)
 *   • all non-admin members removed
 *   • beer catalog reset to a fixed set of 10 (8 beers + 2 soft drinks)
 *   • a fixed roster of 50 seeded members (role `member`)
 *
 *   pnpm db:reset:operational
 *
 * Refuses to run unless DATABASE_URL points at localhost (see db-reset).
 * Single-club oriented: the operational TRUNCATEs are whole-table.
 */
import { and, eq, like, notInArray, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { beerTypes } from '@/lib/db/schema/catalog';
import { avatarUploads } from '@/lib/db/schema/avatar-uploads';
import { members } from '@/lib/db/schema/members';
import { users } from '@/lib/db/schema/auth';
import { clubs } from '@/lib/db/schema/clubs';
import { env } from '@/lib/env';

const SEED_MEMBER_COUNT = 50;
const SEED_EMAIL_DOMAIN = 'seed.beeromat.local';

// 8 beers + 2 soft drinks. price in minor units (haléř).
const BEERS: { name: string; priceMinor: bigint }[] = [
  { name: 'Pilsner Urquell', priceMinor: 4500n },
  { name: 'Kozel 11°', priceMinor: 3800n },
  { name: 'Bernard 12°', priceMinor: 4200n },
  { name: 'Gambrinus 10°', priceMinor: 3200n },
  { name: 'Radegast 12°', priceMinor: 3600n },
  { name: 'Staropramen 10°', priceMinor: 3400n },
  { name: 'Svijany 11°', priceMinor: 4000n },
  { name: 'Budvar 12°', priceMinor: 4400n },
  { name: 'Kofola', priceMinor: 2800n }, // soft drink
  { name: 'Voda', priceMinor: 1500n }, // soft drink
];

const FIRST_NAMES = [
  'Jan', 'Petr', 'Pavel', 'Martin', 'Tomáš', 'Jakub', 'Lukáš', 'Marek', 'Ondřej', 'Filip',
  'David', 'Michal', 'Josef', 'Karel', 'Václav', 'Roman', 'Radek', 'Milan', 'Aleš', 'Jaroslav',
  'Eva', 'Jana', 'Hana', 'Lucie', 'Kateřina', 'Markéta', 'Tereza', 'Veronika', 'Petra', 'Klára',
  'Barbora', 'Alena', 'Lenka', 'Zuzana', 'Monika',
];
const LAST_NAMES = [
  'Novák', 'Svoboda', 'Novotný', 'Dvořák', 'Černý', 'Procházka', 'Kučera', 'Veselý', 'Horák',
  'Němec', 'Pokorný', 'Pospíšil', 'Hájek', 'Jelínek', 'Král', 'Růžička', 'Beneš', 'Fiala',
  'Sedláček', 'Doležal', 'Zeman', 'Kolář', 'Navrátil', 'Čermák', 'Urban', 'Vaněk', 'Blažek',
  'Kříž', 'Kovář', 'Marek',
];
const AVATAR_KEYS = ['beer-mug', 'tennis-ball', 'trophy', 'lightning', 'target', 'star', 'heart', 'sparkle'];

// Operational tables — wiped wholesale (RESTART IDENTITY CASCADE handles
// inter-table FKs). NOT touched: clubs, club_banking_profiles, user,
// account, session, verification, device_sessions, members, beer_types,
// avatar_uploads (those are reset surgically below).
const OPERATIONAL_TABLES = [
  'consumptions',
  'consumption_voids',
  'bet_transfers',
  'bet_transfer_voids',
  'matches',
  'match_bet_transfers',
  'match_agreements',
  'match_agreement_sides',
  'payments',
  'payment_state_transitions',
  'drink_sessions',
  'stock_changes',
  'invitations',
];

function assertLocalTarget(): void {
  const url = env.DATABASE_URL;
  const looksLocal =
    url.includes('localhost') || url.includes('127.0.0.1') || Boolean(env.NEON_LOCAL_PROXY_HOST);
  if (!looksLocal) {
    throw new Error(
      `[reset-operational] Refusing to run: DATABASE_URL is not local (${url}).`,
    );
  }
  if (env.NODE_ENV === 'production') {
    throw new Error('[reset-operational] Refusing to run: NODE_ENV=production');
  }
}

async function main(): Promise<void> {
  assertLocalTarget();

  // 1) Resolve the club + the admins to keep (login survival).
  const club = await db.query.clubs.findFirst();
  if (!club) {
    throw new Error(
      '[reset-operational] No club found. Bootstrap one first (pnpm db:reset:bootstrap + sign in).',
    );
  }
  const admins = await db.query.members.findMany({
    where: and(eq(members.clubId, club.id), eq(members.role, 'club_admin')),
  });
  if (admins.length === 0) {
    throw new Error(
      '[reset-operational] No club_admin member found — refusing to wipe (you would lose access).',
    );
  }
  const adminUserId = admins[0]!.userId;
  const adminMemberIds = admins.map((a) => a.id);
  console.log(
    `[reset-operational] Club ${club.id} (${club.name}); keeping ${admins.length} admin(s).`,
  );

  // 2) Wipe all operational data (whole-table; single-club dev DB).
  const quoted = OPERATIONAL_TABLES.map((t) => `"${t}"`).join(', ');
  await db.execute(sql.raw(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`));
  console.log(`[reset-operational] Truncated ${OPERATIONAL_TABLES.length} operational table(s).`);

  // 3) Remove non-admin members (+ their avatar uploads), then recycle
  //    seed users from prior runs so they don't accumulate.
  await db.delete(avatarUploads).where(notInArray(avatarUploads.memberId, adminMemberIds));
  await db
    .delete(members)
    .where(and(eq(members.clubId, club.id), notInArray(members.id, adminMemberIds)));
  // Seed users are now memberless — delete them (device_sessions cascade).
  const memberedUserIds = (await db.select({ userId: members.userId }).from(members)).map(
    (r) => r.userId,
  );
  await db
    .delete(users)
    .where(
      and(
        like(users.email, `%@${SEED_EMAIL_DOMAIN}`),
        memberedUserIds.length > 0 ? notInArray(users.id, memberedUserIds) : undefined,
      ),
    );
  console.log('[reset-operational] Removed non-admin members + recycled seed users.');

  // 4) Reset the beer catalog to the fixed 10.
  await db.delete(beerTypes).where(eq(beerTypes.clubId, club.id));
  await db.insert(beerTypes).values(
    BEERS.map((b, i) => ({
      clubId: club.id,
      name: b.name,
      unitPriceMinor: b.priceMinor,
      currentStock: 100,
      displayOrder: i,
      createdByUserId: adminUserId,
    })),
  );
  console.log(`[reset-operational] Seeded ${BEERS.length} beers (incl. 2 soft drinks).`);

  // 5) Seed the 50-member roster (stable emails → idempotent).
  const now = new Date();
  for (let n = 1; n <= SEED_MEMBER_COUNT; n++) {
    const email = `seed-member-${n}@${SEED_EMAIL_DOMAIN}`;
    const displayName = `${FIRST_NAMES[n % FIRST_NAMES.length]} ${LAST_NAMES[n % LAST_NAMES.length]}`;
    let user = await db.query.users.findFirst({ where: eq(users.email, email) });
    if (!user) {
      [user] = await db
        .insert(users)
        .values({ email, name: displayName, emailVerified: true })
        .returning();
    }
    await db.insert(members).values({
      clubId: club.id,
      userId: user!.id,
      email,
      displayName,
      role: 'member',
      isActive: true,
      acceptedInvitationAt: now,
      createdByUserId: adminUserId,
      avatarKey: AVATAR_KEYS[n % AVATAR_KEYS.length],
    });
  }
  console.log(`[reset-operational] Seeded ${SEED_MEMBER_COUNT} members.`);

  const total = await db.select({ id: members.id }).from(members).where(eq(members.clubId, club.id));
  console.log(
    `[reset-operational] Done. Clean sheet: ${total.length} members, ${BEERS.length} beers, no operational data.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error('[reset-operational] Failed:', err);
    process.exit(1);
  });

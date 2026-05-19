/**
 * Seed the single v1 club + bootstrap admin from SEED_* env vars.
 *
 * Run with `pnpm db:seed` after `pnpm db:migrate` against a fresh DB.
 * Idempotent: re-running on an already-seeded DB is a no-op.
 *
 * What it inserts:
 *   - One `clubs` row using SEED_CLUB_*
 *   - One `club_banking_profiles` row (banking config blank — admin sets
 *     IBAN/Revolut via the in-app admin UI, per constitution v1.1.1)
 *   - One Better Auth `users` row for SEED_ADMIN_EMAIL (so magic-link
 *     sign-in with disableSignUp: true can find the existing user)
 *   - One `members` row linking the user to the club with role
 *     `club_admin`
 *
 * The admin signs in via magic link as normal; this script just makes
 * the user record exist ahead of that first sign-in.
 */
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { clubBankingProfiles, clubs } from '@/lib/db/schema/clubs';
import { members } from '@/lib/db/schema/members';
import { users } from '@/lib/db/schema/auth';
import { env } from '@/lib/env';

async function main(): Promise<void> {
  console.log('[seed] Starting seed for beeromat v1 single-club deployment…');

  // 1) Club row (find or insert by name).
  let club = await db.query.clubs.findFirst({ where: eq(clubs.name, env.SEED_CLUB_NAME) });
  if (!club) {
    const [inserted] = await db
      .insert(clubs)
      .values({
        name: env.SEED_CLUB_NAME,
        currencyCode: env.SEED_CLUB_CURRENCY,
        defaultLocale: env.SEED_CLUB_LOCALE,
      })
      .returning();
    if (!inserted) throw new Error('Failed to insert club');
    club = inserted;
    console.log(`[seed] Inserted club ${club.id} (${club.name})`);
  } else {
    console.log(`[seed] Club already exists: ${club.id} (${club.name})`);
  }

  // 2) Banking profile (one row per club; banking fields left null —
  //    admin configures IBAN/Revolut via the in-app admin UI).
  const existingProfile = await db.query.clubBankingProfiles.findFirst({
    where: eq(clubBankingProfiles.clubId, club.id),
  });
  if (!existingProfile) {
    await db.insert(clubBankingProfiles).values({ clubId: club.id });
    console.log(`[seed] Inserted empty banking profile for club ${club.id}`);
  } else {
    console.log(`[seed] Banking profile already exists for club ${club.id}`);
  }

  // 3) Better Auth user (so magic-link sign-in with disableSignUp:true
  //    can find the existing user record).
  let adminUser = await db.query.users.findFirst({
    where: eq(users.email, env.SEED_ADMIN_EMAIL),
  });
  if (!adminUser) {
    const [inserted] = await db
      .insert(users)
      .values({
        email: env.SEED_ADMIN_EMAIL,
        name: env.SEED_ADMIN_NAME,
        emailVerified: true,
      })
      .returning();
    if (!inserted) throw new Error('Failed to insert admin user');
    adminUser = inserted;
    console.log(`[seed] Inserted admin user ${adminUser.id} (${adminUser.email})`);
  } else {
    console.log(`[seed] Admin user already exists: ${adminUser.id} (${adminUser.email})`);
  }

  // 4) Member row linking the admin user to the club with role
  //    club_admin.
  const existingMember = await db.query.members.findFirst({
    where: eq(members.userId, adminUser.id),
  });
  if (!existingMember) {
    await db.insert(members).values({
      clubId: club.id,
      userId: adminUser.id,
      email: adminUser.email,
      displayName: adminUser.name,
      role: 'club_admin',
      acceptedInvitationAt: new Date(),
    });
    console.log(`[seed] Inserted member row for ${adminUser.email} as club_admin`);
  } else {
    console.log(`[seed] Member row already exists for ${adminUser.email}`);
  }

  console.log('[seed] Done.');
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error('[seed] Failed:', err);
    process.exit(1);
  });

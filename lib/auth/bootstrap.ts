import 'server-only';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema/auth';
import { clubs, clubBankingProfiles } from '@/lib/db/schema/clubs';
import { members } from '@/lib/db/schema/members';
import type { OnboardingInput } from '@/lib/validation/onboarding';

// Spec 008 — self-bootstrap post-verify promotion.
//
// Extracted from lib/auth/better-auth.ts's databaseHooks.session.
// create.after so the state-machine logic is directly unit-testable
// against PGlite via vi.mock('@/lib/db/client') — same pattern the
// existing balance.spec.ts uses to swap the production db for the
// in-process PGlite instance without changing the prod call signature.
//
// Behaviour per data-model.md §2 state machine:
//   - If no members row exists anywhere AND a seeded clubs row exists,
//     insert one members row for the given user with role='club_admin'
//     on the seeded club.
//   - If members count > 0 (someone already bootstrapped, or a
//     concurrent call won the race), no-op.
//   - If no seeded club exists (deploy-time precondition violated),
//     log a warning and no-op.
//
// Race safety via pg_advisory_xact_lock — see inline note.
export async function promoteFirstUserIfNeeded(
  userId: string,
): Promise<{ promoted: boolean; reason?: string }> {
  return db.transaction(async (tx) => {
    // Race safety: acquire a transactional advisory lock keyed by a
    // constant (008 = the spec number). Two concurrent promote calls
    // serialise here — the second waits until the first transaction
    // commits/rollbacks, then proceeds with the post-first members
    // count, which will be > 0 and short-circuit. A simple
    // `SELECT count(*) FROM members FOR UPDATE` would be cleaner but
    // PostgreSQL rejects aggregate + row-lock combinations
    // ("FOR UPDATE is not allowed with aggregate functions"). The
    // advisory lock is released automatically at transaction end.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(1008)`);

    const memberResult = await tx.execute<{ n: string }>(
      sql`SELECT count(*) AS n FROM members`,
    );
    const memberCount = Number(memberResult.rows[0]?.n ?? 0);
    if (memberCount > 0) {
      return { promoted: false, reason: 'already-bootstrapped' };
    }

    const seededClub = await tx.query.clubs.findFirst();
    if (!seededClub) {
      return { promoted: false, reason: 'no-seeded-club' };
    }

    const user = await tx.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (!user) {
      return { promoted: false, reason: 'user-not-found' };
    }

    await tx.insert(members).values({
      clubId: seededClub.id,
      userId: user.id,
      email: user.email,
      displayName: user.name ?? user.email.split('@')[0] ?? user.email,
      role: 'club_admin',
      isActive: true,
      acceptedInvitationAt: new Date(),
      createdByUserId: null,
    });

    return { promoted: true };
  });
}

// Spec 009 — wizard's transactional insert leg.
//
// Extracted from app/[locale]/setup/actions.ts::bootstrapClubAction
// so the state-machine logic (advisory lock, FR-012 recheck, three
// inserts in one transaction) is directly unit-testable via
// vi.mock('@/lib/db/client') + PGlite — same pattern this file's
// promoteFirstUserIfNeeded uses for spec 008.
//
// The action wraps this with: input parsing, fresh-state cache
// invalidation, NEXT_LOCALE cookie set, magic-link dispatch via
// Better Auth, revalidatePath. None of those belong in the
// transaction itself.
export type CreateClubAndAdminUserResult =
  | { kind: 'inserted'; clubId: string; userId: string }
  | { kind: 'already-complete' };

export async function createClubAndAdminUserTx(
  input: OnboardingInput,
): Promise<CreateClubAndAdminUserResult> {
  return db.transaction(async (tx) => {
    // Spec 008 + 009 share advisory-lock key 1008 so all three
    // bootstrap entry points (wizard, requestMagicLinkAction
    // pre-create, promoteFirstUserIfNeeded) serialise correctly.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(1008)`);

    // FR-012 — defence in depth. The proxy is supposed to redirect
    // post-bootstrap /setup visits before this code runs, but the
    // recheck inside the transaction is the real boundary: a crafted
    // POST cannot insert a second clubs row.
    const counts = await tx.execute<{ clubs: string; users: string } & Record<string, unknown>>(
      sql`
        SELECT
          (SELECT count(*)::text FROM clubs) AS clubs,
          (SELECT count(*)::text FROM "user") AS users
      `,
    );
    const row = counts.rows[0];
    const clubsCount = Number(row?.clubs ?? 0);
    const usersCount = Number(row?.users ?? 0);
    if (clubsCount > 0 || usersCount > 0) {
      return { kind: 'already-complete' as const };
    }

    const [clubRow] = await tx
      .insert(clubs)
      .values({
        name: input.clubName,
        currencyCode: input.currencyCode,
        defaultLocale: input.defaultLocale,
      })
      .returning();
    if (!clubRow) throw new Error('[bootstrap] failed to insert clubs row');

    await tx.insert(clubBankingProfiles).values({ clubId: clubRow.id });

    const userId = randomUUID();
    await tx.insert(users).values({
      id: userId,
      email: input.adminEmail,
      // Local-part of the email as a friendly default display name;
      // the admin can change it later via /admin/config or /account.
      name: input.adminEmail.split('@')[0] ?? input.adminEmail,
      emailVerified: false,
    });

    return { kind: 'inserted' as const, clubId: clubRow.id, userId };
  });
}

import 'server-only';
import { eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema/auth';
import { members } from '@/lib/db/schema/members';

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

import 'server-only';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink } from 'better-auth/plugins';
import { db } from '@/lib/db/client';
import { accounts, sessions, users, verifications } from '@/lib/db/schema/auth';
import { env } from '@/lib/env';
import { promoteFirstUserIfNeeded } from '@/lib/auth/bootstrap';
import { sendMagicLink } from '@/lib/email/mailer';

// Better Auth v1.6 server instance with the magic-link plugin.
// Constitution Principle IV: invitation-only, magic-link as root of trust,
// device-scoped PIN handled separately by lib/auth/pin.ts.
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
    },
  }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  advanced: {
    database: {
      // Better Auth's default ID generator emits non-UUID random
      // strings. Every Better Auth table in lib/db/schema/auth.ts
      // declares `id` as a Postgres `uuid` column, so Better Auth MUST
      // emit UUIDs — 'uuid' makes it use crypto.randomUUID(). Without
      // this, every user/session/verification insert fails with
      // "invalid input syntax for type uuid".
      generateId: 'uuid',
    },
  },
  emailAndPassword: {
    // We never use passwords; magic-link only.
    enabled: false,
  },
  plugins: [
    magicLink({
      // 5 minutes — short window per the constitution's auth guidance.
      expiresIn: 300,
      // Invitation-only: no public sign-up. Invitations must pre-exist.
      disableSignUp: true,
      sendMagicLink: async ({ email, url }) => {
        await sendMagicLink({ to: email, url });
      },
    }),
  ],
  rateLimit: {
    // On in production; a test rig (production build, many sign-ins)
    // sets AUTH_RATE_LIMIT_ENABLED=false. Magic-link abuse is also
    // fronted by Turnstile + checkMagicLinkLimits (lib/rate-limit).
    enabled: env.AUTH_RATE_LIMIT_ENABLED === 'true',
  },
  session: {
    // 30-day Better Auth session; device-PIN re-prompt is independent
    // (lib/auth/pin.ts handles inactivity-based re-prompt).
    expiresIn: 60 * 60 * 24 * 30,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },
  trustedOrigins: [env.BETTER_AUTH_URL],
  databaseHooks: {
    session: {
      create: {
        // Spec 008 FR-001 / FR-003 — bootstrap promotion at verify
        // time. The pre-create in requestMagicLinkAction's bootstrap
        // branch (lib/auth/actions.ts) leaves the user with NO role.
        // Only a successful magic-link round-trip (which is what
        // creates this session) earns the club_admin promotion.
        //
        // Race safety: this hook fires once per session-create. We
        // lock the members table with FOR UPDATE so two near-
        // simultaneous bootstrap completions serialise — exactly one
        // gets the club_admin row; the second sees memberCount > 0
        // and no-ops (state C in data-model.md §2).
        after: async (session) => {
          try {
            const result = await promoteFirstUserIfNeeded(session.userId);
            if (result.promoted) {
              console.info('[bootstrap] promoted first user to club_admin', {
                userId: session.userId,
              });
            } else if (result.reason && result.reason !== 'already-bootstrapped') {
              console.warn('[bootstrap] promotion skipped', {
                userId: session.userId,
                reason: result.reason,
              });
            }
          } catch (err) {
            // Send-best-effort discipline — never block session
            // creation on a bootstrap-promotion failure. The session
            // is already valid; the user can re-sign-in to retry.
            console.error('[bootstrap] promotion failed', err);
          }
        },
      },
    },
  },
});

export type Auth = typeof auth;

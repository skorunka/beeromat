import 'server-only';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink } from 'better-auth/plugins';

import { db } from '@/lib/db/client';
import { accounts, sessions, users, verifications } from '@/lib/db/schema/auth';
import { env } from '@/lib/env';
import { sendMagicLink } from '@/lib/email/resend';

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
});

export type Auth = typeof auth;

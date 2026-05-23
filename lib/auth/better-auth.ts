import 'server-only';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink } from 'better-auth/plugins';
import { getLocale } from 'next-intl/server';

import { db } from '@/lib/db/client';
import { accounts, sessions, users, verifications } from '@/lib/db/schema/auth';
import { env } from '@/lib/env';
import { sendMagicLink } from '@/lib/email/mailer';
import type { Locale } from '@/lib/i18n/routing';

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
        // Spec 007 FR-005: thread the request's locale through so the
        // email renders in the same language as the sign-in form the
        // user just submitted. .catch(() => undefined) is the defensive
        // seatbelt — if this callback ever runs outside a request
        // context, the mailer's own fallback (normalizeLocale →
        // routing.defaultLocale) kicks in.
        const locale = (await getLocale().catch(() => undefined)) as Locale | undefined;
        await sendMagicLink({ to: email, url, locale });
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
});

export type Auth = typeof auth;

import 'server-only';
import { z } from 'zod';

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),
  // Optional local-proxy host (e.g. "localhost:14445") for the Neon
  // serverless driver. When set, the driver's HTTP + WebSocket
  // endpoints route through a local proxy (docker-compose's
  // local-neon-http-proxy) instead of Neon Cloud. Unset in production.
  // NOT a test-only switch — any deployment routing through a private
  // Neon mirror would use it. See constitution v1.3.0.
  NEON_LOCAL_PROXY_HOST: z.string().min(1).optional(),

  // Better Auth
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
  BETTER_AUTH_URL: z.string().url(),
  // Better Auth's built-in request rate limiter. Defaults on. A
  // deployment that fronts auth with its own limiter (Turnstile +
  // checkMagicLinkLimits) or that is a test rig may set this 'false'.
  // Configuration, not code — the E2E suite runs a production build and
  // would otherwise throttle its own many sign-ins.
  AUTH_RATE_LIMIT_ENABLED: z.enum(['true', 'false']).default('true'),

  // Email — SMTP connection URL (nodemailer). Local dev + E2E point at
  // the Mailpit container (smtp://localhost:11025); production points at
  // a real SMTP gateway (e.g. Resend's). One code path, env-driven.
  SMTP_URL: z.string().min(1).startsWith('smtp'),
  EMAIL_FROM: z.string().min(1),

  // Bot mitigation
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1),
  TURNSTILE_SECRET_KEY: z.string().min(1),

  // Rate limiting
  UPSTASH_REDIS_REST_URL: z.string().url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),

  // Seed — consumed only by scripts/seed.ts (and by the v1.8 bootstrap
  // fallback for the very first sign-in if no club row exists yet).
  // Optional at runtime: a deployment that has already bootstrapped its
  // club via the admin UI (constitution Principle II) doesn't need these
  // env vars to start. scripts/seed.ts does its own strict check at the
  // top of main() before reading them.
  SEED_ADMIN_EMAIL: z.string().email().optional(),
  SEED_ADMIN_NAME: z.string().min(1).optional(),
  SEED_CLUB_NAME: z.string().min(1).optional(),
  SEED_CLUB_CURRENCY: z
    .string()
    .length(3)
    .regex(/^[A-Z]{3}$/, 'Must be an ISO 4217 currency code, e.g. CZK')
    .optional(),
  SEED_CLUB_LOCALE: z
    .string()
    .regex(/^[a-z]{2}(-[A-Z]{2})?$/)
    .optional(),

  // Runtime
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  if (process.env.SKIP_ENV_VALIDATION === '1') {
    return process.env as unknown as Env;
  }

  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid or missing environment variables:\n${issues}`);
  }

  return parsed.data;
}

export const env = loadEnv();

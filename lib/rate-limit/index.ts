import 'server-only';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

import { env } from '@/lib/env';

// Lazy-initialized Upstash Redis + Ratelimit. Same rationale as
// lib/db/client.ts — defer connection until first use so `next build`
// can collect routes without real Upstash credentials.

let _redis: Redis | null = null;

function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return _redis;
}

let _magicLinkPerEmail: Ratelimit | null = null;
let _magicLinkPerIp: Ratelimit | null = null;

/**
 * Magic-link send limit per invited email address.
 * 3 sends per hour — covers an honest user retrying, blocks bots.
 */
export function magicLinkPerEmailLimiter(): Ratelimit {
  if (!_magicLinkPerEmail) {
    _magicLinkPerEmail = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(3, '1 h'),
      analytics: true,
      prefix: 'rl:magic-link:email',
    });
  }
  return _magicLinkPerEmail;
}

/**
 * Magic-link send limit per source IP.
 * 10 sends per hour — generous for shared NAT, still bot-hostile.
 */
export function magicLinkPerIpLimiter(): Ratelimit {
  if (!_magicLinkPerIp) {
    _magicLinkPerIp = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(10, '1 h'),
      analytics: true,
      prefix: 'rl:magic-link:ip',
    });
  }
  return _magicLinkPerIp;
}

/**
 * Check both magic-link rate limits (per-email + per-IP).
 *
 * **Fails OPEN on infrastructure error.** Rate limiting is defense in
 * depth, not the primary control — Cloudflare Turnstile already gates
 * the magic-link form. If Upstash is unreachable (outage, network
 * blip), letting a legitimate user sign in is the correct trade-off
 * over taking authentication down entirely. The error is logged so an
 * outage is still visible.
 *
 * Returns `{ allowed: false }` only when the limiter is reachable AND
 * a limit was genuinely exceeded.
 */
export async function checkMagicLinkLimits(
  email: string,
  ip: string | undefined,
): Promise<{ allowed: boolean }> {
  // Honour AUTH_RATE_LIMIT_ENABLED (lib/env.ts). An environment with no
  // real Upstash — notably the E2E rig, whose `.env.test` points the
  // Upstash URL at a deliberately-unreachable host — sets this 'false'.
  // Skipping here avoids a per-request fetch failure and the noisy
  // "[rate-limit] limiter unavailable" log line. Production leaves it
  // 'true', so the limiter runs exactly as before.
  if (env.AUTH_RATE_LIMIT_ENABLED === 'false') {
    return { allowed: true };
  }

  try {
    const perEmail = await magicLinkPerEmailLimiter().limit(`email:${email}`);
    if (!perEmail.success) return { allowed: false };
    if (ip) {
      const perIp = await magicLinkPerIpLimiter().limit(`ip:${ip}`);
      if (!perIp.success) return { allowed: false };
    }
    return { allowed: true };
  } catch (err) {
    console.error('[rate-limit] limiter unavailable — failing open:', err);
    return { allowed: true };
  }
}

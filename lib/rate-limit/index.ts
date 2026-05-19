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

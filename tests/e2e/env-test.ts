import { readFileSync } from 'node:fs';
import path from 'node:path';

// Shared .env.test parser for E2E setup/teardown/specs. Avoids adding
// `dotenv` as a dependency — KEY=VALUE parsing is trivial.

export function readEnvTest(): Record<string, string> {
  const envPath = path.resolve(__dirname, '../../.env.test');
  const text = readFileSync(envPath, 'utf-8');
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

/**
 * Propagate the SEED_* values from .env.test into process.env so the
 * test-db fixture (which reads process.env for seed values) sees them.
 */
export function applySeedEnv(env: Record<string, string>): void {
  for (const key of [
    'SEED_CLUB_NAME',
    'SEED_CLUB_CURRENCY',
    'SEED_CLUB_LOCALE',
    'SEED_ADMIN_EMAIL',
    'SEED_ADMIN_NAME',
  ]) {
    const v = env[key];
    if (v) process.env[key] = v;
  }
}

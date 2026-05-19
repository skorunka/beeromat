import 'server-only';
import argon2 from 'argon2';

// Argon2id parameters tuned to ~150–250 ms per hash on Vercel's Node
// 24 runtime. OWASP-recommended baseline for 2026:
//   - argon2id variant
//   - memoryCost: 64 MiB (65536 KiB)
//   - timeCost: 3
//   - parallelism: 4
// research.md §6 for rationale.
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 4,
} as const;

const PIN_REGEX = /^\d{4}$/;

export function isValidPinFormat(pin: string): boolean {
  return PIN_REGEX.test(pin);
}

export async function hashPin(pin: string): Promise<string> {
  if (!isValidPinFormat(pin)) {
    throw new Error('PIN must be exactly 4 digits');
  }
  return argon2.hash(pin, ARGON2_OPTIONS);
}

export async function verifyPin(pinHash: string, pin: string): Promise<boolean> {
  if (!isValidPinFormat(pin)) {
    return false;
  }
  try {
    return await argon2.verify(pinHash, pin);
  } catch {
    // Malformed hash, version mismatch, etc. Treat as a verification
    // failure (do not leak the underlying error).
    return false;
  }
}

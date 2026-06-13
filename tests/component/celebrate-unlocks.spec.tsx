import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted so these exist when the (hoisted) vi.mock factories run.
const { success, celebrateBeer } = vi.hoisted(() => ({
  success: vi.fn(),
  celebrateBeer: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success } }));
vi.mock('@/lib/celebrate', () => ({ celebrateBeer }));

import { celebrateUnlocks } from '@/components/achievements/celebrate-unlocks';

// Spec 035 — the in-the-moment unlock path. Caller component tests pass with
// mocked results that omit unlockedBadges (→ no-op), so the NON-empty path is
// covered here directly: 🍻 once + a toast per badge naming it.
const t = (key: string, values?: Record<string, string | number>) =>
  values ? `${key}:${JSON.stringify(values)}` : key;

describe('celebrateUnlocks (spec 035)', () => {
  beforeEach(() => {
    success.mockClear();
    celebrateBeer.mockClear();
  });

  it('fires the 🍻 once + a toast naming the badge on a non-empty unlock', () => {
    celebrateUnlocks(['centuryClub'], t);
    expect(celebrateBeer).toHaveBeenCalledTimes(1);
    expect(success).toHaveBeenCalledTimes(1);
    // toast text routes through the achievement.unlocked key with the badge name
    expect(String(success.mock.calls[0]![0])).toContain('unlocked');
    expect(String(success.mock.calls[0]![0])).toContain('centuryClub');
  });

  it('one toast per badge for a multi-unlock, but a single celebration', () => {
    celebrateUnlocks(['centuryClub', 'winner'], t);
    expect(celebrateBeer).toHaveBeenCalledTimes(1);
    expect(success).toHaveBeenCalledTimes(2);
  });

  it('no-ops on empty or undefined', () => {
    celebrateUnlocks([], t);
    celebrateUnlocks(undefined, t);
    expect(celebrateBeer).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
  });
});

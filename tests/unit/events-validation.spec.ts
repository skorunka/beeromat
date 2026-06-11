import { describe, it, expect } from 'vitest';

import {
  createSeriesSchema,
  setRsvpSchema,
  setMemberRsvpSchema,
} from '@/lib/validation/events';

describe('events validation', () => {
  it('createSeriesSchema accepts a valid series', () => {
    const r = createSeriesSchema.safeParse({
      weekday: 2,
      startLocalTime: '17:00',
      placeLabel: 'Antuka',
    });
    expect(r.success).toBe(true);
  });

  it('createSeriesSchema rejects bad weekday and time', () => {
    expect(createSeriesSchema.safeParse({ weekday: 8, startLocalTime: '17:00', placeLabel: 'x' }).success).toBe(false);
    expect(createSeriesSchema.safeParse({ weekday: 2, startLocalTime: '25:00', placeLabel: 'x' }).success).toBe(false);
    expect(createSeriesSchema.safeParse({ weekday: 2, startLocalTime: '7:0', placeLabel: 'x' }).success).toBe(false);
    expect(createSeriesSchema.safeParse({ weekday: 2, startLocalTime: '17:00', placeLabel: '' }).success).toBe(false);
  });

  it('setRsvpSchema requires a uuid + valid status', () => {
    expect(setRsvpSchema.safeParse({ occurrenceId: cryptoUuid(), status: 'going' }).success).toBe(true);
    expect(setRsvpSchema.safeParse({ occurrenceId: 'nope', status: 'going' }).success).toBe(false);
    expect(setRsvpSchema.safeParse({ occurrenceId: cryptoUuid(), status: 'maybe' }).success).toBe(false);
  });

  it('setMemberRsvpSchema additionally requires memberId', () => {
    expect(setMemberRsvpSchema.safeParse({ occurrenceId: cryptoUuid(), status: 'going' }).success).toBe(false);
    expect(
      setMemberRsvpSchema.safeParse({ occurrenceId: cryptoUuid(), memberId: cryptoUuid(), status: 'not_going' }).success,
    ).toBe(true);
  });
});

function cryptoUuid(): string {
  return '00000000-0000-4000-8000-000000000000';
}

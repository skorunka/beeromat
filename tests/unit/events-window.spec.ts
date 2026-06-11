import { describe, it, expect } from 'vitest';

import { pragueLocalToInstant, pragueDateParts } from '@/lib/events/prague-time';
import {
  addDays,
  currentPragueWeekDates,
  isOccurrenceOpen,
  nextOccurrenceDates,
  lowTurnoutKey,
} from '@/lib/events/window';

describe('prague-time: local wall-clock → UTC instant (DST-aware)', () => {
  it('winter (CET, +1): 17:00 → 16:00 UTC', () => {
    expect(pragueLocalToInstant('2026-01-13', '17:00').toISOString()).toBe(
      '2026-01-13T16:00:00.000Z',
    );
  });

  it('summer (CEST, +2): 17:00 → 15:00 UTC', () => {
    expect(pragueLocalToInstant('2026-07-14', '17:00').toISOString()).toBe(
      '2026-07-14T15:00:00.000Z',
    );
  });

  it('just after the spring-forward (late March) is CEST (+2)', () => {
    // DST starts last Sunday of March (2026-03-29); 2026-03-31 is CEST.
    expect(pragueLocalToInstant('2026-03-31', '17:00').toISOString()).toBe(
      '2026-03-31T15:00:00.000Z',
    );
  });

  it('just after the fall-back (late October) is CET (+1)', () => {
    // DST ends last Sunday of October (2026-10-25); 2026-10-27 is CET.
    expect(pragueLocalToInstant('2026-10-27', '17:00').toISOString()).toBe(
      '2026-10-27T16:00:00.000Z',
    );
  });

  it('pragueDateParts: Tuesday noon-UTC reads as Tue, iso 2', () => {
    const { dateStr, isoWeekday } = pragueDateParts(new Date('2026-06-16T10:00:00Z'));
    expect(dateStr).toBe('2026-06-16');
    expect(isoWeekday).toBe(2);
  });
});

describe('window: calendar math', () => {
  it('addDays rolls over months', () => {
    expect(addDays('2026-03-31', 1)).toBe('2026-04-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('currentPragueWeekDates: Mon..Sun of the current week', () => {
    const { monday, sunday } = currentPragueWeekDates(new Date('2026-06-16T10:00:00Z')); // Tue
    expect(monday).toBe('2026-06-15');
    expect(sunday).toBe('2026-06-21');
  });

  it('nextOccurrenceDates: next N of a weekday from a date', () => {
    expect(nextOccurrenceDates(2, '2026-06-15', 3)).toEqual([
      '2026-06-16',
      '2026-06-23',
      '2026-06-30',
    ]);
    // From Monday asking for Monday → same day first.
    expect(nextOccurrenceDates(1, '2026-06-15', 2)).toEqual(['2026-06-15', '2026-06-22']);
  });
});

describe('window: isOccurrenceOpen', () => {
  const monNow = new Date('2026-06-15T08:00:00Z'); // Monday morning, this week
  const base = { status: 'scheduled' as const, startsAt: new Date('2026-06-16T15:00:00Z') };

  it('open: scheduled, this week, not yet started', () => {
    expect(isOccurrenceOpen({ ...base, occurrenceDate: '2026-06-16' }, monNow)).toBe(true);
  });

  it('closed: next week (out of current window)', () => {
    expect(isOccurrenceOpen({ ...base, occurrenceDate: '2026-06-23' }, monNow)).toBe(false);
  });

  it('closed: start time already passed', () => {
    const after = new Date('2026-06-16T16:00:00Z');
    expect(isOccurrenceOpen({ ...base, occurrenceDate: '2026-06-16' }, after)).toBe(false);
  });

  it('closed: cancelled', () => {
    expect(
      isOccurrenceOpen(
        { status: 'cancelled', occurrenceDate: '2026-06-16', startsAt: base.startsAt },
        monNow,
      ),
    ).toBe(false);
  });
});

describe('window: lowTurnoutKey', () => {
  it('none / low / fine', () => {
    expect(lowTurnoutKey(0)).toBe('none');
    expect(lowTurnoutKey(2)).toBe('low');
    expect(lowTurnoutKey(3)).toBeNull();
  });
});

// Spec 032 — pure week-window + open-state + generation-date logic.
// All calendar-date arithmetic is on 'YYYY-MM-DD' strings (locale-free,
// UTC-based date math); timezone only matters for the start-time instant
// (see prague-time.ts). Callers pass `now` so everything unit-tests.

import { pragueDateParts } from './prague-time';

/** Add `n` days to a 'YYYY-MM-DD' string (pure calendar arithmetic). */
export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(
    t.getUTCDate(),
  ).padStart(2, '0')}`;
}

/**
 * The current Prague week as local date strings: Monday … Sunday inclusive.
 * Week starts Monday (Czech/ISO convention).
 */
export function currentPragueWeekDates(now: Date): { monday: string; sunday: string } {
  const { dateStr, isoWeekday } = pragueDateParts(now);
  const monday = addDays(dateStr, -(isoWeekday - 1));
  const sunday = addDays(monday, 6);
  return { monday, sunday };
}

export interface OccurrenceOpenInput {
  status: 'scheduled' | 'cancelled';
  occurrenceDate: string; // 'YYYY-MM-DD' local
  startsAt: Date; // absolute instant
}

/**
 * Open for RSVP iff: scheduled, its date falls in the current Prague week,
 * and its start time has not passed. Pure function of `now`.
 */
export function isOccurrenceOpen(o: OccurrenceOpenInput, now: Date): boolean {
  if (o.status !== 'scheduled') return false;
  if (now.getTime() >= o.startsAt.getTime()) return false;
  const { monday, sunday } = currentPragueWeekDates(now);
  return o.occurrenceDate >= monday && o.occurrenceDate <= sunday;
}

/**
 * The next `horizonWeeks` local dates matching `isoWeekday` (1=Mon…7=Sun),
 * starting from the first such date on/after `fromDate` (a 'YYYY-MM-DD').
 * Used by idempotent generation.
 */
export function nextOccurrenceDates(
  isoWeekday: number,
  fromDate: string,
  horizonWeeks: number,
): string[] {
  // weekday of fromDate
  const [y, m, d] = fromDate.split('-').map(Number) as [number, number, number];
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const fromIso = dow === 0 ? 7 : dow;
  let delta = isoWeekday - fromIso;
  if (delta < 0) delta += 7;
  const first = addDays(fromDate, delta);
  const out: string[] = [];
  for (let i = 0; i < horizonWeeks; i++) out.push(addDays(first, i * 7));
  return out;
}

/**
 * Which playful low-turnout line (if any) for a going-count. Returns an i18n
 * key suffix or null when turnout is fine. The component maps it to copy.
 */
export function lowTurnoutKey(goingCount: number): 'none' | 'low' | null {
  if (goingCount <= 0) return 'none';
  if (goingCount <= 2) return 'low';
  return null;
}

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

// RSVP is open for sessions starting within this ROLLING window from now.
// 7 days = the next instance of each weekly series, always — no calendar-
// week dead zone (e.g. Thursday night still shows next week's Tue/Thu).
export const OPEN_WINDOW_DAYS = 7;
const OPEN_WINDOW_MS = OPEN_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/**
 * Open for RSVP iff: scheduled, its start time hasn't passed, and it starts
 * within the rolling OPEN_WINDOW_DAYS from `now`. Pure function of `now`.
 */
export function isOccurrenceOpen(o: OccurrenceOpenInput, now: Date): boolean {
  if (o.status !== 'scheduled') return false;
  const delta = o.startsAt.getTime() - now.getTime();
  return delta > 0 && delta <= OPEN_WINDOW_MS;
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
 * Tennis-math turnout "vibe" for a going-count — drives a playful, always-on
 * one-liner on the occurrence card (2 → a singles match, 4 → doubles, …).
 * Returns an i18n key suffix; the component maps it to copy (+ the count).
 */
export type TurnoutVibe =
  | 'none' // 0 — empty court
  | 'solo' // 1 — hit against the wall
  | 'single' // 2 — singles match
  | 'threesome' // 3 — odd one out / Canadian doubles
  | 'doubles' // 4 — perfect doubles
  | 'fiver' // 5 — doubles + a sub
  | 'crowd'; // 6+ — rotation / tournament

export function turnoutVibe(goingCount: number): TurnoutVibe {
  if (goingCount <= 0) return 'none';
  if (goingCount === 1) return 'solo';
  if (goingCount === 2) return 'single';
  if (goingCount === 3) return 'threesome';
  if (goingCount === 4) return 'doubles';
  if (goingCount === 5) return 'fiver';
  return 'crowd';
}

// Spec 032 — pure, DST-aware Europe/Prague time helpers. No dependency:
// the timezone offset for any instant comes from Intl. Kept pure (callers
// pass `now`) so it unit-tests cleanly, including across DST transitions.

const TZ = 'Europe/Prague';

const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  return Number(parts.find((p) => p.type === type)!.value);
}

// Offset (minutes, local − UTC) that Europe/Prague has AT the given UTC instant.
// e.g. +60 in winter (CET), +120 in summer (CEST).
function pragueOffsetMinutes(utcInstant: Date): number {
  const p = partsFmt.formatToParts(utcInstant);
  const localAsUtc = Date.UTC(
    part(p, 'year'),
    part(p, 'month') - 1,
    part(p, 'day'),
    part(p, 'hour') % 24,
    part(p, 'minute'),
    part(p, 'second'),
  );
  return (localAsUtc - utcInstant.getTime()) / 60000;
}

/**
 * The absolute UTC instant for a Prague wall-clock date + time.
 * @param dateStr local calendar date 'YYYY-MM-DD' (Prague)
 * @param timeStr local wall-clock time 'HH:MM' (Prague)
 *
 * Two passes settle the offset at DST boundaries (the offset at the naive
 * guess can differ from the offset at the true instant).
 */
export function pragueLocalToInstant(dateStr: string, timeStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number];
  const [hh, mm] = timeStr.split(':').map(Number) as [number, number];
  const naive = Date.UTC(y, m - 1, d, hh, mm);
  let offset = pragueOffsetMinutes(new Date(naive));
  let instant = naive - offset * 60000;
  offset = pragueOffsetMinutes(new Date(instant));
  instant = naive - offset * 60000;
  return new Date(instant);
}

/** Prague-local calendar parts of a UTC instant. isoWeekday: 1=Mon … 7=Sun. */
export function pragueDateParts(now: Date): { dateStr: string; isoWeekday: number } {
  const p = partsFmt.formatToParts(now);
  const y = part(p, 'year');
  const m = part(p, 'month');
  const d = part(p, 'day');
  const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  // getUTCDay on the local Y/M/D gives the calendar weekday (locale-free).
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun … 6=Sat
  const isoWeekday = dow === 0 ? 7 : dow;
  return { dateStr, isoWeekday };
}

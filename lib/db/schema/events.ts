import {
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { users } from './auth';
import { clubs } from './clubs';
import { members } from './members';
import { eventOccurrenceStatus, eventRsvpStatus } from './enums';

// Spec 032 — event attendance (RSVP) for recurring weekly sessions.
// A series is a weekly template (weekday + local time + place); the nightly
// cron generates occurrences (idempotent); members RSVP per occurrence.

// event_series — the recurring weekly template, admin-managed, club-scoped.
export const eventSeries = pgTable(
  'event_series',
  {
    id: uuid().primaryKey().defaultRandom(),
    clubId: uuid()
      .notNull()
      .references(() => clubs.id, { onDelete: 'restrict' }),
    // ISO weekday: 1=Mon … 7=Sun.
    weekday: integer().notNull(),
    // Wall-clock start time in the club's local zone (Europe/Prague), 'HH:MM'.
    startLocalTime: text().notNull(),
    placeLabel: text().notNull(),
    // Optional display title; when null the UI derives one from weekday+time.
    title: text(),
    isActive: integer().notNull().default(1), // 1 = active, 0 = deactivated
    createdByUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_event_series_club_active').on(t.clubId, t.isActive)],
);

// event_occurrences — one concrete dated instance of a series.
// Open-for-RSVP is DERIVED (status + current Prague week + now<startsAt),
// never stored. UNIQUE(series_id, occurrence_date) makes generation idempotent.
export const eventOccurrences = pgTable(
  'event_occurrences',
  {
    id: uuid().primaryKey().defaultRandom(),
    clubId: uuid()
      .notNull()
      .references(() => clubs.id, { onDelete: 'restrict' }),
    seriesId: uuid()
      .notNull()
      .references(() => eventSeries.id, { onDelete: 'cascade' }),
    // Local (Prague) calendar date — used for week-bucketing + display.
    occurrenceDate: date({ mode: 'string' }).notNull(),
    // Absolute instant of the session start (local time -> UTC, DST-aware).
    startsAt: timestamp({ withTimezone: true }).notNull(),
    // Snapshot from the series at generation time (series edits don't rewrite
    // existing occurrences).
    placeLabel: text().notNull(),
    status: eventOccurrenceStatus().notNull().default('scheduled'),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uniq_event_occurrences_series_date').on(t.seriesId, t.occurrenceDate),
    index('idx_event_occurrences_club_date').on(t.clubId, t.occurrenceDate),
  ],
);

// event_rsvps — one member's CURRENT status for one occurrence (mutable;
// upserted on change). Absence of a row = "no answer". setByUserId records
// who set it (self vs admin-on-behalf).
export const eventRsvps = pgTable(
  'event_rsvps',
  {
    id: uuid().primaryKey().defaultRandom(),
    clubId: uuid()
      .notNull()
      .references(() => clubs.id, { onDelete: 'restrict' }),
    occurrenceId: uuid()
      .notNull()
      .references(() => eventOccurrences.id, { onDelete: 'cascade' }),
    memberId: uuid()
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    status: eventRsvpStatus().notNull(),
    setByUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uniq_event_rsvps_occurrence_member').on(t.occurrenceId, t.memberId),
  ],
);

export type EventSeries = typeof eventSeries.$inferSelect;
export type NewEventSeries = typeof eventSeries.$inferInsert;
export type EventOccurrence = typeof eventOccurrences.$inferSelect;
export type NewEventOccurrence = typeof eventOccurrences.$inferInsert;
export type EventRsvp = typeof eventRsvps.$inferSelect;
export type NewEventRsvp = typeof eventRsvps.$inferInsert;

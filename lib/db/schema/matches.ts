import { check, index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { users } from './auth';
import { betTransfers } from './bets';
import { clubs } from './clubs';
import { members } from './members';

// Spec 012 — matches (singles only for v1.12).
//
// One row per logged match. The compensating-row pattern (constitution
// V) lives inline here: voidedAt + voidedByUserId + voidReason rather
// than a separate match_voids table — simpler at this single-club
// scale and the void is tied 1:1 to the original row (no need for an
// append-only event table). Bet transfers created at match-log time
// reference matches via a future `matches_to_bet_transfers` linking
// table — but for v1.12 the action just returns the created
// bet_transfer ids in its response, and the void action looks them
// up the same way at undo time.
export const matches = pgTable(
  'matches',
  {
    id: uuid().primaryKey().defaultRandom(),
    clubId: uuid()
      .notNull()
      .references(() => clubs.id, { onDelete: 'restrict' }),
    winnerMemberId: uuid()
      .notNull()
      .references(() => members.id, { onDelete: 'restrict' }),
    loserMemberId: uuid()
      .notNull()
      .references(() => members.id, { onDelete: 'restrict' }),
    playedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdByUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    voidedAt: timestamp({ withTimezone: true }),
    voidedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    voidReason: text(),
  },
  (t) => [
    // No self-match: winner ≠ loser.
    check('chk_matches_distinct_members', sql`${t.winnerMemberId} <> ${t.loserMemberId}`),
    index('idx_matches_club_played').on(t.clubId, t.playedAt),
    index('idx_matches_winner').on(t.winnerMemberId, t.playedAt),
    index('idx_matches_loser').on(t.loserMemberId, t.playedAt),
  ],
);

// Link table — spec 012. Each row says "this bet_transfer was created
// as part of this match". A match has 0..N transfers; a transfer
// belongs to at most one match. Used by voidMatchAction at undo time
// to look up the transfers to void alongside the match row.
export const matchBetTransfers = pgTable(
  'match_bet_transfers',
  {
    matchId: uuid()
      .notNull()
      .references(() => matches.id, { onDelete: 'restrict' }),
    betTransferId: uuid()
      .notNull()
      .references(() => betTransfers.id, { onDelete: 'restrict' }),
  },
  (t) => [
    primaryKey({ columns: [t.matchId, t.betTransferId] }),
    index('idx_match_bet_transfers_match').on(t.matchId),
  ],
);

export type Match = typeof matches.$inferSelect;
export type NewMatch = typeof matches.$inferInsert;
export type MatchBetTransfer = typeof matchBetTransfers.$inferSelect;

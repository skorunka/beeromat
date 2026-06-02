import { boolean, check, index, pgEnum, pgTable, primaryKey, smallint, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { users } from './auth';
import { betTransfers } from './bets';
import { beerTypes } from './catalog';
import { clubs } from './clubs';
import { members } from './members';

// Spec 012 — matches (singles only for v1.12).
// Spec 013 (v1.13) — adds doubles + pre-match agreements. The existing
// `matches` shape is unchanged; doubles results land as TWO rows
// sharing an `agreement_id` (so 012's history / undo queries keep
// working). The agreement layer lives in two new tables below
// (`match_agreements` + `match_agreement_sides`).
//
// One row per logged match. The compensating-row pattern (constitution
// V) lives inline here: voidedAt + voidedByUserId + voidReason rather
// than a separate match_voids table — simpler at this single-club
// scale and the void is tied 1:1 to the original row (no need for an
// append-only event table). Bet transfers created at match-log time
// reference matches via the `match_bet_transfers` link table.

export const matchFormat = pgEnum('match_format', ['singles', 'doubles']);
export const matchPairingKind = pgEnum('match_pairing_kind', ['straight', 'crossed']);

export const matchAgreements = pgTable(
  'match_agreements',
  {
    id: uuid().primaryKey().defaultRandom(),
    clubId: uuid()
      .notNull()
      .references(() => clubs.id, { onDelete: 'restrict' }),
    format: matchFormat().notNull(),
    forBeer: boolean().notNull(),
    pairingKind: matchPairingKind(),
    // Spec 030 — the beer the match is played for, chosen at create when
    // forBeer. Copied onto each match_bet_debt as the delivery default.
    // NULL for friendly matches and pre-030 agreements.
    betBeerTypeId: uuid().references(() => beerTypes.id, { onDelete: 'set null' }),
    winningSide: text(),
    resultRecordedAt: timestamp({ withTimezone: true }),
    resultRecordedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    reversedAt: timestamp({ withTimezone: true }),
    reversedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    cancelledAt: timestamp({ withTimezone: true }),
    cancelledByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdByUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
  },
  (t) => [
    // Doubles agreements MUST have a pairing; singles MUST NOT.
    check(
      'chk_match_agreements_pairing_when_doubles',
      sql`(${t.format} = 'doubles' AND ${t.pairingKind} IS NOT NULL) OR (${t.format} = 'singles' AND ${t.pairingKind} IS NULL)`,
    ),
    // winning_side enum constraint (text + CHECK rather than pgEnum so
    // the column can be NULL without a sentinel value).
    check(
      'chk_match_agreements_winning_side',
      sql`${t.winningSide} IS NULL OR ${t.winningSide} IN ('A', 'B')`,
    ),
    // Mutual-exclusion of terminal states: a cancelled agreement
    // cannot also carry a recorded/reversed result.
    check(
      'chk_match_agreements_cancel_xor_result',
      sql`${t.cancelledAt} IS NULL OR (${t.resultRecordedAt} IS NULL AND ${t.reversedAt} IS NULL)`,
    ),
    // Drives UpcomingAgreementsList — open agreements only.
    index('idx_match_agreements_club_open')
      .on(t.clubId, t.createdAt)
      .where(sql`${t.resultRecordedAt} IS NULL AND ${t.cancelledAt} IS NULL`),
    // Drives recently-recorded views.
    index('idx_match_agreements_club_recorded')
      .on(t.clubId, t.resultRecordedAt)
      .where(sql`${t.resultRecordedAt} IS NOT NULL`),
  ],
);

export const matchAgreementSides = pgTable(
  'match_agreement_sides',
  {
    agreementId: uuid()
      .notNull()
      .references(() => matchAgreements.id, { onDelete: 'restrict' }),
    side: text().notNull(),
    seat: smallint().notNull(),
    memberId: uuid()
      .notNull()
      .references(() => members.id, { onDelete: 'restrict' }),
  },
  (t) => [
    primaryKey({ columns: [t.agreementId, t.side, t.seat] }),
    // No same member on two seats of the same agreement (FR-014).
    unique('uq_match_agreement_sides_distinct_members').on(t.agreementId, t.memberId),
    check('chk_match_agreement_sides_side', sql`${t.side} IN ('A', 'B')`),
    check('chk_match_agreement_sides_seat', sql`${t.seat} IN (1, 2)`),
    index('idx_match_agreement_sides_agreement').on(t.agreementId),
    index('idx_match_agreement_sides_member').on(t.memberId),
  ],
);

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
    // Spec 013 — back-pointer to the agreement that produced this row.
    // NULL for historical 012 one-step singles rows. NOT NULL for every
    // row created via 013's record-result path.
    agreementId: uuid().references(() => matchAgreements.id, { onDelete: 'restrict' }),
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
    index('idx_matches_agreement').on(t.agreementId),
  ],
);

// Link table — spec 012. Each row says "this bet_transfer was created
// as part of this match". A match has 0..N transfers; a transfer
// belongs to at most one match. Used by the undo path to look up the
// transfers to void alongside the match row.
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
export type MatchAgreement = typeof matchAgreements.$inferSelect;
export type NewMatchAgreement = typeof matchAgreements.$inferInsert;
export type MatchAgreementSide = typeof matchAgreementSides.$inferSelect;
export type NewMatchAgreementSide = typeof matchAgreementSides.$inferInsert;

// Spec 034 — pure stats constants, importable by both server queries and
// client/presentational components (no 'server-only', no db).

/** "This season" = rolling last N days (tab is current-state, ignores this). */
export const SEASON_DAYS = 90;

/** Win-rate leaderboard min matches — keeps tiny samples off the board. */
export const WINRATE_MIN_MATCHES = 10;

/** Min games for best/worst partner + nemesis/favourite-victim selection. */
export const MIN_H2H_GAMES = 3;
export const MIN_PARTNER_GAMES = 3;

// Spec 034 — shared types for the read-only stats layer (leaderboards +
// player profiles). All computed on read; nothing persisted.

export type BoardKey =
  | 'beers'
  | 'tab'
  | 'wins'
  | 'played'
  | 'winRate'
  | 'streak'
  | 'boughtForOthers'
  // Spec 037 — count of held achievements (all-time; ignores season scope).
  | 'badges';

export type Scope = 'allTime' | 'season';

/** A member's avatar fields (for <MemberAvatar />), repeated across shapes. */
export interface MemberFace {
  displayName: string;
  avatarKey: string | null;
  avatarUploadAt: Date | null;
}

export interface BoardRow extends MemberFace {
  memberId: string;
  /** The board's metric value. Money (tab) is minor units as a number for
   *  ranking display; the page formats it via formatMoney from the bigint. */
  value: number;
  /** 1-based dense rank; ties share a rank, ordered by displayName. */
  rank: number;
}

export interface Leaderboard {
  key: BoardKey;
  scope: Scope;
  rows: BoardRow[];
  /** The viewing member's own row, even when outside the top-N (for pinning). */
  viewerRow: BoardRow | null;
  /** e.g. the win-rate min-matches note; null when no caption needed. */
  thresholdNote: string | null;
}

export interface HeadToHead extends MemberFace {
  opponentId: string;
  wins: number;
  losses: number;
}

export interface PartnerRecord extends MemberFace {
  partnerId: string;
  wins: number;
  games: number;
}

export interface FavouriteBeer {
  beerTypeId: string;
  name: string;
  count: number;
}

export interface OwedTo extends MemberFace {
  memberId: string;
  beerCount: number;
}

export interface MemberStats extends MemberFace {
  memberId: string;
  matchesPlayed: number;
  won: number;
  lost: number;
  /** won / played; null when played === 0. */
  winRatio: number | null;
  currentStreak: number;
  bestStreak: number;
  nemesis: HeadToHead | null;
  favouriteVictim: HeadToHead | null;
  bestPartner: PartnerRecord | null;
  jinxPartner: PartnerRecord | null;
  totalBeers: number;
  beersPerNight: number | null;
  favouriteBeer: FavouriteBeer | null;
  roundsPoured: number;
  // Spec 035 — extra aggregates so every badge predicate is derivable from
  // MemberStats. distinctBeerTypes: distinct non-voided beerTypeIds logged;
  // sessionsAttended: distinct drink sessions the member drank in.
  distinctBeerTypes: number;
  sessionsAttended: number;
  tabMinor: bigint;
  lastWinAt: Date | null;
  owesMostTo: OwedTo | null;
}

export interface FunLine {
  /** A funline.* catalog key. */
  key: string;
  params: Record<string, string | number>;
}

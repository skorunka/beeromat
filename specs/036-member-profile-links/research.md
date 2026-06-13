# Research: Member-name profile links (spec 036)

## R1 — Which surfaces actually need linking?

- **Decision**: Link (1) the IOU counterparty on `BeerIouRow`, and (2) the on-behalf
  "od {logger}" attribution on `TabEntryRow`. The "home match card" needs nothing
  extra — `MatchBetModule` only renders `BeerIouRow`s, so US1 covers it.
- **Rationale**: Scouting the code: `components/home/match-bet-module.tsx` maps over
  `BeerIouRow`; there is no separate plain-text matchup name on home. The leaderboards,
  match detail (player chips), and profile cross-links already link (spec 034).

## R2 — Are the member ids already available? (→ no query change)

- **Decision**: Yes. `BeerDebtRow` carries `counterpartyMemberId` (+ avatar fields,
  spec 030); `MemberTabEntry` carries `loggerMemberId` (+ avatar fields, spec 023,
  already used to render the logger avatar). **No query or schema change needed.**
- **Rationale**: Both files already pass these ids to `MemberAvatar`/`avatarUploadUrl`,
  so the link target is in hand. FR-009's "may add an id" turns out moot.

## R3 — Avoiding nested anchors

- **Decision**: `BeerIouRow` and `TabEntryRow` are `Card` (div) rows, NOT row-links —
  so wrapping the avatar+name block in a `Link` introduces no nesting. The IOU
  deliver/write-off `<button>`s are siblings of the link, not ancestors/descendants.
- **Rationale**: Confirmed by reading both files. The only genuine nested-anchor risk
  is the match-hub recent-results row (a whole-row `<Link>` to the match) — DEFERRED.

## R4 — Linking a name embedded in an ICU sentence

- **Decision**: Wrap the whole avatar+text *block* in one `Link` rather than trying to
  link a substring of a `t()` result. For the IOU label ("Dlužíš pivo {name}") and the
  on-behalf line ("od {logger}"), the entire left block becomes one finger-sized tap
  target → the counterparty/logger profile.
- **Alternatives considered**: `t.rich` to link just the `{name}` token — more precise
  but more code; unnecessary when the whole block can be the target. Used nowhere here.
- **Consequence**: The won/lost-bet rows put the logger mid-sentence AND already link
  the row's source match in the subtitle, so block-wrapping would fight the match link
  there → those are DEFERRED (would need `t.rich`, low value).

## R5 — Link styling

- **Decision**: Reuse the existing member-name link look (the leaderboard row name link
  / match-detail chip): subtle hover underline on the name; the avatar stays as-is. No
  new visual language, no layout shift.

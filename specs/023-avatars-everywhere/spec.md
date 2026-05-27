# Feature Specification: Avatars Everywhere

**Feature Branch**: `023-avatars-everywhere`

**Created**: 2026-05-27

**Status**: Shipped (2026-05-27)

**Input**: User description: render `<MemberAvatar />` next to
every member name in the app. Spec 020 + 021 built the avatar
primitive (glyph picker + photo upload); only /account and
/admin/members render it today. Every other surface that talks
about a member — pending payments, bet transfers, on-behalf
attribution, history, pickers — is still text-only.

## Clarifications

### Session 2026-05-27

- Q: Avatar sizing — how many size variants does MemberAvatar
  need? → A: Option A — TWO sizes baked into the component as
  a variant prop. `inline` (h-5 w-5) for text-flow attribution
  (`/tab` "od X", bet messages, history bet transfers); `row`
  (h-8 w-8) for list cards (`/admin/pending`,
  `/bet` drinks-you-can-take). Mirrors the density of
  `/admin/members` (which uses h-10 w-10 for the roster but
  that's a heavier roster context — h-8 reads as a tight list
  row across the new surfaces).
- Q: Picker scope — what do we do about the three native
  `<select>` pickers (`/log/for`, `/match` new, `/match` edit)?
  → A: Option β — SKIP all three pickers for this spec. Ship
  the 6 display-only surfaces (US1-US4) now; defer picker
  conversion to a separate spec 024. Lighter scope, ships
  faster, the visible-row recognition wins land immediately.
  Picker conversion involves swapping native `<option>` for
  custom dropdown primitives + accessible keyboard nav +
  possibly filter-as-you-type for large clubs — a discrete
  follow-up.

## User Scenarios & Testing

### User Story 1 — Treasurer recognizes payers at a glance (Priority: P1)

Jiří (treasurer, persona P4) opens `/admin/pending` after
Wednesday's match night. A stack of pending payment claims is
waiting. Each row shows the payer's avatar next to their name
and amount — Jiří spots Pavel's photo, taps to confirm, and
moves on without having to read the name. The recently-confirmed
list (with its undo affordance) uses the same recognition cue.

**Why this priority**: The treasurer surface is the daily-use
case where recognition speed matters most — confirmations
happen in bulk after each match. A face is faster to recognize
than a name in a list. This is the strongest direct-utility
win in the spec.

**Independent Test**: Seed three payments from three different
members (one with an uploaded photo, one with a glyph, one
with no avatar). Open `/admin/pending` as a treasurer and
verify each row renders the correct avatar variant (photo /
glyph / initials fallback) without any change to the existing
text, amount, or action affordances.

**Acceptance Scenarios**:

1. **Given** a pending claim from a member with an uploaded photo,
   **When** the treasurer loads `/admin/pending`, **Then** the
   row renders the member's photo at row-density size next to
   the existing name + amount.
2. **Given** a pending claim from a member who has picked a
   glyph (e.g. trophy) but has no upload, **When** the treasurer
   loads `/admin/pending`, **Then** the row renders the glyph
   chip in the member's club color.
3. **Given** a pending claim from a member who has never set
   an avatar, **When** the treasurer loads `/admin/pending`,
   **Then** the row renders the existing initials fallback —
   visual layout matches the photo/glyph variants (no shift).
4. **Given** a recently-confirmed payment, **When** the treasurer
   sees it under "Právě potvrzené" with the Undo button,
   **Then** the row also shows the member's avatar next to
   the name.

---

### User Story 2 — Bet-time member recognition (Priority: P1)

Pavel opens `/bet` during a doubles night and sees the "drinks
you can take" list. Each entry shows the beer name + the
current owner's avatar + name. Pavel sees Tomáš's photo next
to a Pilsner entry and taps "Beru si ho" without parsing
text. The "past bets this session" list uses the same
recognition cue on the youTook / tookYours messages.

**Why this priority**: `/bet` is consulted during the active
match — phone in hand, sweaty palms, fast decisions. Visual
recognition is faster than reading names under those
conditions. Same intensity-of-use argument as US1.

**Independent Test**: Seed an open session with two members
who own a transferable consumption each (one with a photo,
one without). Open `/bet` as a third member and verify both
entries render the owner's avatar inline with the existing
"BeerName · OwnerName" label.

**Acceptance Scenarios**:

1. **Given** a transferable consumption owned by Tomáš,
   **When** Pavel opens `/bet`, **Then** Tomáš's avatar
   renders next to the "Pilsner · Tomáš" entry.
2. **Given** a past bet transfer in this session where the
   actor took a drink from another member, **When** the
   actor scrolls to the "past bets" list, **Then** both
   members' avatars render inline with the youTook /
   tookYours message.
3. **Given** the session has no transferable consumptions,
   **When** Pavel opens `/bet`, **Then** the existing
   empty-state copy renders unchanged.

---

### User Story 3 — On-behalf attribution feels personal (Priority: P1)

Tereza opens `/tab` and looks at her line items. The beer Pavel
logged on her behalf shows Pavel's avatar next to the existing
"od Pavel" attribution — she recognizes who logged it without
reading the name. Self-logs and match-origin rows stay unchanged
(no avatar to add for those origins).

**Why this priority**: On-behalf logs are the only `/tab`
origin type that names a person; the other three origins are
either self-logs (no attribution needed) or non-person sources
(match, lost bet). Adding the logger's face directly answers
"who did this?" — currently the answer is a name buried in
a subtitle.

**Independent Test**: Seed a consumption on Tereza's tab logged
on her behalf by Pavel. Open `/tab` as Tereza and verify the
row shows Pavel's avatar inline with the "od Pavel" subtitle.
Self-logged consumptions on the same tab render unchanged
(no extra avatar).

**Acceptance Scenarios**:

1. **Given** a consumption logged on Tereza's tab by Pavel,
   **When** Tereza opens `/tab`, **Then** Pavel's avatar
   renders inline with the "od Pavel" subtitle on that row.
2. **Given** a self-logged consumption on Tereza's tab,
   **When** Tereza opens `/tab`, **Then** the row renders
   exactly as before — no avatar added.
3. **Given** a row whose origin is a lost bet or a match,
   **When** Tereza opens `/tab`, **Then** the row renders
   exactly as before — origin chip unchanged.

---

### User Story 4 — Session-history bet rows show faces (Priority: P2)

Jiří reconciles last month's session, opens `/history/[id]`,
scrolls to the bet transfers section, and sees each youTook /
tookYours line with the involved members' avatars. The
recognition cue carries over from `/bet` (US2) so the live
and retrospective views feel consistent.

**Why this priority**: Lower frequency than US1/US2/US3 (history
review is monthly-ish, not match-night) but trivial extra
work given US2 has already added the avatar fields to the
shared query path.

**Independent Test**: Seed a closed session with one bet
transfer. Open `/history/[sessionId]` and verify both members'
avatars render inline with the existing message.

**Acceptance Scenarios**:

1. **Given** a closed session with a bet transfer between two
   members, **When** anyone opens `/history/[sessionId]`,
   **Then** the bet transfer row shows both members' avatars
   alongside the existing message.
2. **Given** a closed session with no bet transfers,
   **When** anyone opens `/history/[sessionId]`, **Then** the
   bet-transfers section is hidden (existing behavior preserved).

---

### Edge Cases

- A member whose `avatar_key` and `avatar_upload_at` are both
  NULL (e.g. Standa, persona P3) — every surface MUST fall
  back to the existing initials chip without a layout shift
  (the picker / list height stays constant).
- A member's avatar upload bytes were deleted (the FK row is
  gone but `avatar_upload_at` is still set) — the renderer
  MUST gracefully fall back through to the glyph / initials
  chain. The MemberAvatar component already handles this.
- A row references a member who is no longer active in the
  club (`is_active = false`) — the row still renders the
  avatar; the deactivation does not strip the avatar. Existing
  text already renders for inactive members on `/admin/members`.
- A row references a member from another club (cross-tenancy
  bug) — the avatar URL endpoint (per spec 021) already
  returns 404 cross-club; the renderer falls back to initials.
  No tenancy leak.
- A surface renders many members at once (e.g. `/bet` past-bets
  list during a long session, `/log/for` picker for a large
  club) — avatar URLs are unique per upload version
  (`avatarUploadUrl(memberId, uploadAt)`); browser cache reuses
  them across surfaces, so adding the avatar does not multiply
  network requests across the page.

## Requirements

### Functional Requirements

- **FR-001**: System MUST render `<MemberAvatar />` next to
  the payer name on `/admin/pending` pending claim rows.
- **FR-002**: System MUST render `<MemberAvatar />` next to
  the payer name on `/admin/pending` recently-confirmed rows.
- **FR-003**: System MUST render `<MemberAvatar />` inline
  with the owner name on `/bet` "drinks you can take" rows.
- **FR-004**: System MUST render `<MemberAvatar />` inline
  with the named members on `/bet` past-bets youTook /
  tookYours rows.
- **FR-005**: System MUST render `<MemberAvatar />` inline
  with the named members on `/history/[sessionId]` bet-
  transfer rows.
- **FR-006**: System MUST render `<MemberAvatar />` inline
  with the logger name on `/tab` on-behalf attribution
  subtitles. Self-logs, lost-bet rows, and match-origin
  rows MUST NOT render an additional avatar.
- **FR-007**: Every surface added by this feature MUST
  fall back to the existing initials chip when the member
  has neither a glyph nor an uploaded photo — no broken
  image, no missing chip, no layout shift relative to
  the avatar-populated variants.
- **FR-008**: Every query result powering the surfaces above
  MUST include the member's id, `avatar_key`, and
  `avatar_upload_at` for each named member referenced —
  these three fields are the inputs the renderer needs to
  build the avatar URL chain.
- **FR-009**: Avatars MUST NOT carry any interaction (no
  hover card, no profile popover, no tap action) — they
  are decorative recognition cues. Existing row-level
  interactions (Confirm, Beru si ho, Undo, etc.) MUST
  remain attached to their existing affordances.
- **FR-010**: System MUST expose two avatar size variants on
  the `MemberAvatar` component (per Clarifications Q1 → A):
  `inline` (h-5 w-5) for text-flow attribution and `row`
  (h-8 w-8) for list cards. The variant is selected per
  surface call-site.
- **FR-011**: Native `<select>` pickers (`/log/for`,
  `/match` new + edit forms) are OUT OF SCOPE for this
  spec (per Clarifications Q2 → β). Picker conversion is
  deferred to a separate spec 024.
- **FR-012**: Cross-club avatar URL requests MUST continue
  to return 404 (spec 021 behavior preserved) — this spec
  introduces no new endpoint surface.

### Key Entities

- **Member display row**: A UI row that names a single
  member by display name. After this spec, every such row
  also carries that member's id + avatar_key +
  avatar_upload_at so the renderer can pick the right
  avatar variant.
- **Bet-transfer row**: A UI row that names two members
  (from + to). Carries both members' avatar fields.
- **No new persistent entities**: The avatar primitive
  (members.avatar_key + members.avatar_upload_at + the
  avatar_uploads bytea table from spec 021) is reused
  unchanged.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Every member-name rendering site in scope
  (surfaces 1-6: `/admin/pending` pending + confirmed,
  `/bet` drinks-you-can-take + past-bets, `/history/[id]`
  bet transfers, `/tab` on-behalf attribution) shows the
  member's avatar on the first render after this spec
  ships — verified by a manual walkthrough with a seeded
  multi-avatar club.
- **SC-002**: Members with no avatar set (no glyph, no
  upload) see the existing initials chip on every surface
  — zero regression for persona P3 (Standa).
- **SC-003**: Each surface's existing interactions (Confirm
  on `/admin/pending`, Beru si ho on `/bet`, Undo on
  `/admin/pending` confirmed list, picker selection on
  `/log/for`) remain functional with no change to their
  click targets or accessible labels.
- **SC-004**: Avatar load adds no perceptible page-load
  delay on a typical club's data (≤ 30 members, ≤ 50
  rows per surface) — uploaded photos are already
  Cache-Control'd; multiple references to the same
  member share the browser cache.
- **SC-005**: Treasurer feedback: "I can confirm payments
  faster because I recognize faces" — qualitative
  validation gathered after one match-night cycle of
  use.

## Assumptions

- Members already have the option to pick a glyph (spec
  020) and upload a photo (spec 021). This spec adds
  zero member-side picker / upload work.
- The MemberAvatar component (`components/ui/member-avatar.tsx`)
  is the canonical renderer; this spec extends its
  size-variant API if Q1 picks A or B, otherwise reuses
  the current API as-is.
- Queries returning member-named rows can be extended
  to JOIN/return the three avatar fields without
  measurable cost — the `members` table is small
  (≤ ~50 rows per club) and already joined for the
  display name in every such query.
- The Image Avatar URL endpoint (`/api/avatar/[memberId]`)
  established by spec 021 handles all cross-club /
  missing-bytes / cache-busting concerns; this spec
  introduces no new endpoint or URL convention.
- Tenancy enforcement is unchanged. Every UI surface
  added by this spec already runs inside an unlocked
  member's context, so the avatar URL it embeds always
  resolves within the caller's own club.
- Performance: avatar uploads are already capped at
  ~256 KiB (spec 021 limit) and served with long
  Cache-Control. Repeat references on the same page
  benefit from browser cache; no new image-optimization
  infra is needed.

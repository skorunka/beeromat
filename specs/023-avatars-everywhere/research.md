# Research: Avatars Everywhere

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-05-27

All decisions resolved before planning. No outstanding
NEEDS CLARIFICATION markers.

## D1 — Avatar size variants (Clarifications Q1 → A)

**Decision**: TWO new size variants added to the existing
`MemberAvatar` component via a `size` prop with three values
(`default`, `row`, `inline`).

| Variant | Class | Used by |
|---------|-------|---------|
| `default` (current) | `h-9 w-9 text-sm` | AppHeader user-menu trigger; `/admin/members` roster (existing). Preserves spec 020/021 behavior. |
| `row` | `h-8 w-8 text-sm` | List-card rows: `/admin/pending` pending + confirmed (US1). |
| `inline` | `h-5 w-5 text-[10px]` | Text-flow attribution: `/tab` "od X" (US3), `/bet` lists (US2), `/history/[id]` bet transfers (US4). |

**Rationale**: One enum keeps the renderer fall-through chain
(upload → glyph → initials → CircleUser) in one place. The
text-size shrinks with the container so initials fit inside
the smaller circles (h-5 was visibly cramped at the default
`text-sm`).

**Alternatives considered**:

- **Option B — three sizes including xs (h-4 w-4)**:
  Rejected. h-5 already reads cleanly inside a single line of
  text on a 360-wide phone; h-4 looks like a typo dot. One
  size for in-text rendering keeps the design
  language simpler.
- **Option C — one size (h-6 w-6) everywhere**:
  Rejected. h-6 is too small to land impact on the
  treasurer's pending list (US1's primary value prop), and
  too large to live inside a sentence on US2/US3/US4. The
  two-size split matches the actual density gradient across
  the surfaces.

## D2 — Picker scope deferral (Clarifications Q2 → β)

**Decision**: Native `<select>` pickers on `/log/for`,
`/match` new + edit forms are OUT OF SCOPE for spec 023.
Deferred to spec 024.

**Rationale**: Converting `<select>` to a custom dropdown is
a larger UI undertaking than the display-only changes
(accessible keyboard nav, focus trap, possibly
filter-as-you-type for clubs with many members). Bundling
it would drag the visible-row recognition wins along behind
that larger work. Splitting lets US1-US4 ship today.

**Alternatives considered**:

- **Option α — convert all three pickers in this spec**:
  Rejected. Doubles the scope and the testing surface;
  bundles unrelated concerns (dropdown component vs
  member-name rendering).
- **Option γ — convert `/log/for` only**:
  Rejected. Creates inconsistent picker styling across the
  app (`/log/for` rich, `/match` native). Either all or
  none.

## D3 — Query-shape extension pattern

**Decision**: Extend existing query result types in-place
(add `memberId`, `avatarKey`, `avatarUploadAt` fields to
each member-naming row). Do NOT introduce a new "member
summary" type to compose into row types.

**Rationale**: Five queries touched, each already projects
the member name onto its own row type. Adding three fields
inline is one Drizzle `.select({...})` change per query and
preserves the existing call-site ergonomics
(`row.memberDisplayName` → `row.memberDisplayName` plus
`row.memberId` / `row.memberAvatarKey` /
`row.memberAvatarUploadAt`). A separate type would mean
nesting (`row.member.displayName`) and break every existing
read site.

**Alternatives considered**:

- **Compose `MemberSummary { id, displayName, avatarKey,
  avatarUploadAt }` type**:
  Rejected. Forces touching every existing read site for a
  feature whose only callers are five renderers — premature
  abstraction. If a sixth surface lands later and wants
  member-card composition, the type can be introduced then.
- **Pass the whole `members` row through**:
  Rejected. Leaks `userId` and other sensitive fields to
  client components.

## D4 — On-behalf `/tab` row data flow

**Decision**: Extend the `MemberTabEntry` shape (in
`lib/db/queries/consumption.ts`) so on-behalf entries carry
`loggerMemberId`, `loggerAvatarKey`, `loggerAvatarUploadAt`
alongside the existing `loggerDisplayName`. Self-logs,
bet-rows, and match-origin rows do NOT get these fields
(they don't carry a logger person at all).

**Rationale**: The four origin types are already distinct
discriminants on the row type; only `kind === 'on-behalf'`
needs the avatar fields. Other kinds either don't name a
person (self, match) or name the bet's loser via an existing
attribution (lost-bet) that this spec keeps text-only.

**Alternatives considered**:

- **Add the fields to all 4 origin types**:
  Rejected. Carries dead nulls on 3 out of 4 types and
  invites a "should we render avatars on lost-bet rows too?"
  question that the spec explicitly closed out.

## D5 — Avatar fallback layout stability

**Decision**: Each surface allocates a fixed-width slot for
the avatar (matches the chosen size variant). The
fallback variant (initials chip) renders inside the same
slot — no row resizing when a member sets / unsets their
avatar.

**Rationale**: Layout shift across the live-data surface
(`/admin/pending` updates after a member just set an
avatar) would be visible jank. `MemberAvatar` already
returns a fixed-sized `<span>` for every render path,
so this is enforced at the primitive level.

**Alternatives considered**:

- **Conditionally omit the avatar slot for fallback**:
  Rejected on UX grounds (jank when the same row is
  re-rendered after a profile edit) and on consistency
  (the initials chip IS the avatar for members who
  haven't picked anything).

## D6 — Browser cache strategy

**Decision**: Reuse spec 021's existing `Cache-Control:
public, max-age=…, immutable` (set on the `/api/avatar/
[memberId]` route handler) with the version-busting URL
pattern `?v=<avatarUploadAt>`. No new cache strategy
introduced.

**Rationale**: Multiple references to the same member on
the same surface (e.g. `/bet` past-bets where one member
appears in N rows) share a single fetch. The browser cache
also persists across surfaces (Pavel's avatar on
`/admin/pending` is hit again on `/bet`).

**Alternatives considered**:

- **Use an `<Image>` component for built-in optimization**:
  Rejected. `next/image` rewrites the URL through `/_next/
  image?url=...` which adds proxy overhead for already-small
  avatar bytes (≤256 KiB cap from spec 021). Direct
  `<img>` inside `MemberAvatar` already keeps things simple.

## D7 — Test scope

**Decision**: Integration tests cover the five query result
shape extensions (each spec verifies the new fields are
returned). Component tests cover (a) MemberAvatar's new size
variants + fallback chain, (b) TabEntryRow's on-behalf row
rendering the avatar.

**Rationale**: The integration layer protects against future
query refactors silently dropping the avatar fields (which
would degrade UI to no-avatar without breaking type
errors, since the fields are optional in the renderer
fallback chain). The component layer protects the most-
load-bearing renderer surface (TabEntryRow has 4 origin
kinds — making sure the avatar appears only on on-behalf
matters).

**Alternatives considered**:

- **Skip integration tests, rely on TypeScript types**:
  Rejected. TS will catch a removed field but not a `null`
  always-returned bug. A regression test that seeds a
  member with an avatar and asserts the row carries the
  fields is a stronger guarantee.
- **Component-test every modified surface**:
  Rejected. Five new test files for renderers that boil
  down to `<MemberAvatar size="…" ... />` is noise. The
  shared component test on MemberAvatar covers the
  primitive once.

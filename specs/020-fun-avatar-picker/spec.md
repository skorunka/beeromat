# Feature Specification: Fun Avatar Picker

**Feature Branch**: `020-fun-avatar-picker`

**Created**: 2026-05-26

**Status**: Shipped (2026-05-27)

**Input**: User description: spec 020 — small predefined avatar
palette so each member can pick a playful glyph (beer mug, tennis
ball, court, etc.) to replace the initials in the user-menu and
anywhere else a member glyph is rendered today. Pet-app personality.

## Clarifications

### Session 2026-05-27

- Q: Where is the avatar key stored? → A: Option A — per-member
  (`members.avatar_key`), per club seat.
- Q: How are the avatar glyphs rendered? → A: Option B — all
  inline SVG (FlagIcon precedent). Brand-controlled style,
  identical pixels on every platform, no emoji-rendering
  variance to worry about.
- Q: Where does the picker UI live? → A: Option A — a new
  section in `/account`. Dropdown stays uncluttered; the
  existing "Účet" row in the user-menu already deep-links there.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Member picks a fun avatar (Priority: P1)

Tereza opens `/account` (via the user-menu "Účet" row), sees a
small grid of playful glyph options in the new avatar section,
taps the tennis ball, and her avatar in the header updates
immediately to show the tennis ball instead of her initials.

**Why this priority**: This is the primary feature. Without US1
the whole spec delivers nothing — and US1 alone already gives the
member the personalization win that motivated the spec. Everything
else in the spec (avatar showing in other places, reset path) is
incremental layering on top of US1.

**Independent Test**: A member visits the account avatar section,
sees the palette, taps one option, and verifies the avatar circle
in the header now shows the picked glyph. Refreshing the page (or
logging out + back in) confirms the choice persisted.

**Acceptance Scenarios**:

1. **Given** a member who has never picked an avatar, **When** they
   open the avatar picker, **Then** they see a small grid of glyph
   options (beer-themed, tennis-themed, playful) and their current
   choice is marked as "initials (default)".
2. **Given** the avatar picker is open, **When** the member taps a
   glyph option, **Then** the choice saves immediately (no separate
   "Save" button), the picker updates to show that glyph as current,
   and the header avatar circle reflects the change without a full
   page reload.
3. **Given** a member has picked an avatar previously, **When** they
   return to the picker on a later session, **Then** their previous
   pick is shown as the currently selected option.

---

### User Story 2 - Avatar shows wherever the member appears (Priority: P1)

When the system renders a member's identity glyph (currently only
the user-menu trigger in the AppHeader, per the audit recorded in
FR-006), the picked avatar is used in place of the initials. Any
future surface that adds a member glyph picks up picked avatars
automatically because every glyph site shares the same renderer.

**Why this priority**: P1 because without this, US1 delivers
personalization in only one spot (the header). Members expect their
chosen avatar to be their identity throughout the app, the same way
their display name is. If the picker only changed one screen the
feature would feel half-finished.

**Independent Test**: Member A picks an avatar; the AppHeader
avatar circle on every authenticated page renders A's SVG glyph
in place of A's initials. Member B (who has never picked)
continues to see initials in the same surface. (The audit in
FR-006 confirmed the AppHeader is the only member-glyph surface
today; future surfaces test the same way via the shared
renderer.)

**Acceptance Scenarios**:

1. **Given** member A has picked the beer mug avatar, **When** A
   loads any authenticated page, **Then** the AppHeader avatar
   circle renders the beer mug SVG (A's display name still shown
   in any text context where it was shown before).
2. **Given** member B has not picked an avatar, **When** B loads
   any authenticated page, **Then** the AppHeader avatar circle
   renders B's initials in the primary-tinted circle — unchanged
   from today's behavior.
3. **Given** the actor changes their avatar in the picker,
   **When** the actor navigates to any page, **Then** the
   AppHeader avatar circle reflects the new pick within one
   navigation tick (no stale glyphs).

---

### User Story 3 - Reset to initials (Priority: P2)

Pavel, after experimenting with a few avatars, decides he wants the
initials back. He opens the avatar picker, taps a clear "use the
default" option, and his glyph returns to initials everywhere.

**Why this priority**: P2 because the feature is usable without it
— a member who regrets a pick can just pick a different glyph. But
some members will want the "neutral / professional / no glyph"
state explicitly, and offering reset costs little.

**Independent Test**: A member with an avatar picked navigates to
the picker, taps the reset option, and verifies the avatar circle
in the header is back to their initials.

**Acceptance Scenarios**:

1. **Given** the avatar picker, **When** the member taps the reset /
   default option, **Then** any previously picked avatar is cleared
   and the initials fallback is restored everywhere.
2. **Given** the member has the default (no avatar) state already,
   **When** they look at the picker, **Then** the default option is
   visually indicated as the current selection (not just unlabelled).

---

### Edge Cases

- **Member with empty display name**: today's fallback uses the
  `CircleUser` lucide icon (no initials available). When such a
  member picks an avatar, the picked glyph replaces the icon.
  When they reset, they go back to the `CircleUser` icon — NOT
  to blank initials.
- **Treasurer viewing a member's profile after the member picks
  an avatar mid-session**: the treasurer's view should reflect
  the new avatar on next navigation (no need for the treasurer
  to log out). Server-rendered surfaces re-read on each request.
- **Concurrent picks**: a member opens the picker on two devices,
  taps two different glyphs in quick succession. The last write
  wins; both devices reflect the final state on next render.
- **Removed-from-palette migration**: if a future version removes
  a glyph from the palette but a member still has it picked, the
  renderer falls back to initials (treating the orphaned key as
  unknown). The member's row is NOT auto-rewritten — they keep
  the historical key until they explicitly pick again.
- **Onboarding fresh install**: new clubs / new members start
  with no avatar picked (initials fallback). The picker is
  reachable from /account from the first authenticated session;
  no first-run prompt.
- **Reduced motion**: if the picker uses any selection animation
  (per `feedback-playful-motion-ok`), it must still respect
  `prefers-reduced-motion` — the swap to the new glyph happens
  instantly without the bounce/pop.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST offer a fixed palette of 8 to 12
  predefined avatar options, each rendered as an inline SVG
  glyph (per Clarifications 2026-05-27 — Option B). The exact
  glyph set is a design decision resolved during planning; for
  the spec, "small curated set with beer-themed + tennis-themed
  + a few generic playful options, all on-brand."

- **FR-002**: A member MUST be able to pick one avatar from the
  palette via a dedicated picker section on `/account` (per
  Clarifications 2026-05-27 — Option A). The picker MUST visually
  indicate the member's current selection.

- **FR-003**: Picking an avatar MUST save immediately on tap (no
  separate "Save" or "Apply" step). The success outcome is
  visible to the member without a full page reload of the picker.

- **FR-004**: A member MUST be able to reset their avatar back to
  the initials (or icon, for empty-name members) fallback at any
  time via an explicit "default / reset" option in the picker.

- **FR-005**: The avatar selection MUST persist across sessions and
  devices. A member's choice on one device MUST be visible on every
  other device the next time the member opens the app.

- **FR-006**: Wherever the system today renders a member's identity
  glyph, the renderer MUST use the picked avatar if one exists,
  falling back to the initials (or icon) otherwise. As of this
  spec's writing the only such surface is the AppHeader user-menu
  trigger for the signed-in member (audited 2026-05-27 — admin /
  treasurer lists, the /tab "od X" attribution, and settle screens
  render member names as text only, with no glyph). Any future
  surface that adds a member glyph MUST use the same renderer
  component so picked avatars propagate automatically.

- **FR-007**: If a member's stored avatar key is not in the current
  palette (e.g. removed in a later version), the renderer MUST fall
  back to initials gracefully and MUST NOT throw or render an empty
  circle.

- **FR-008**: The avatar selection MUST work for any member of the
  signed-in user's active club seat — the actor sets their own
  avatar; no member can set another member's avatar.

- **FR-009**: The picker MUST present the avatar palette in a single
  scroll-free view on a typical phone (the palette is small enough
  that no internal scrolling is required).

- **FR-010**: Avatar glyphs MUST render identically across the
  supported platforms (Windows, macOS, iOS, Android, common Linux
  browsers). The inline-SVG rendering choice (Clarifications
  2026-05-27, Option B) satisfies this by construction — no
  OS-dependent emoji font is involved.

### Key Entities *(include if feature involves data)*

- **Member avatar selection**: a small string key (one of the
  palette identifiers, or null/absent for "use default") attached
  to the member's club seat (the per-club `members` row, NOT the
  cross-club `users` row — see Clarifications 2026-05-27). Empty
  string MUST be treated as null. The key uniquely identifies
  which palette glyph to render; the resolution from key →
  renderable glyph happens at the rendering layer, NOT in storage.
  A member in two clubs (future multi-club case) picks
  independently in each club.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member can change their avatar in 3 taps or fewer
  from the AppHeader (open menu → navigate to picker → tap glyph).

- **SC-002**: When a member picks an avatar, every surface that
  shows that member's glyph reflects the change on the next
  navigation tick — no stale glyphs remain on subsequent renders.

- **SC-003**: A member with no avatar picked experiences zero
  regressions: their initials (or icon fallback for empty-name
  members) display exactly as they did before this feature shipped.

- **SC-004**: The picker fits in a single viewport on phones with
  a 360×640 screen — no internal scrolling within the palette grid.

- **SC-005**: Glyph rendering is visually consistent across Windows,
  macOS, iOS, and Android — no platform falls back to a "tofu"
  empty box or text replacement.

- **SC-006**: The treasurer can distinguish members by their picked
  avatars (when picked) without losing access to the member's
  display name — the avatar is additive, not a replacement for the
  name in any surface that previously showed the name.

## Assumptions

- The current member-identity-glyph surfaces in the app are: the
  AppHeader user-menu trigger, the admin/treasurer member lists,
  the /tab "od X" attribution rows (spec 019), and the
  settle-confirm screens. The spec applies to all of them; if a
  surface is discovered during planning that wasn't on this list,
  it should also be updated per FR-006.

- The palette size of 8 to 12 is a reasonable target for "small but
  varied"; the exact count + glyph set is a planning-time decision
  informed by what renders well across all supported platforms (see
  the flag-icon precedent: Windows ships no flag-emoji glyphs, so
  flags are excluded by default).

- Avatar selection is per-member (per club seat), not per-user.
  Members of two clubs (future multi-club case) can pick different
  avatars in each club. Storage is on `members.avatar_key`
  (resolved in Clarifications 2026-05-27); the user-facing
  behaviour is "your avatar in club X is independent of your
  avatar in club Y."

- The picker UI uses the same circle styling as the existing
  AppHeader avatar trigger (`h-9 w-9 rounded-full` with the
  primary-tint background). Glyph rendering inside the circle is
  centered.

- Empty-name members (where today the `CircleUser` lucide icon is
  shown) follow the same rules as initials-fallback members. The
  picker treats them identically; reset returns the icon, not blank
  whitespace.

- No first-run onboarding prompt for the avatar picker. The picker
  is discoverable from /account; members find it when they want it.
  This keeps the onboarding flow (spec 016) unchanged.

- Audit / activity logging of avatar changes is out of scope.
  Avatar selection is low-stakes and reversible; no event log is
  required.

# Feature Specification: User Account Page (v1.10)

**Feature Branch**: `010-user-account`

**Created**: 2026-05-24

**Status**: Shipped (2026-05-24)

**Input**: User description: "Add a user account page at /account where every signed-in member can edit their own display name. v1.10 scope is strictly the display-name edit. The page also surfaces three stub rows (email, PIN, sign-out-from-all-devices) marked as 'coming later' to signal where future specs extend."

Spec 009 closed the deploy-time bootstrap leg, but it leaves the
first admin's display name auto-derived from the email local-part
(`pavel@example.test` → `pavel`). Pavel will overwhelmingly want
something else — his actual name. There is currently NO surface
anywhere in the app where a member can rename themselves: invitees
set their name at accept time (and never again); the bootstrap admin
gets the auto-derived stub. v1.10 fills that gap with a single
purposeful page at `/account`.

The page is designed to grow into a full account-settings surface
in later specs (email change, PIN reset, sign-out from all devices,
avatar, language preference). v1.10 ships only the display-name
edit, but it ALSO renders three "coming later" stub rows — making
the page feel intentional today and signalling to future specs the
shape they slot into. Those stubs are pure UI; they do not wire up
to any backend.

## Personas *(mandatory — constitution v1.4.0)*

- **P1 — Standa, 67 · Stock manager · Czech only**: was invited as
  `Standa Novák`; mistyped his surname during the accept-invitation
  step. Opens `/account`, fixes it in 15 seconds. Standa is the
  spec's primary user — the persona who actually *needs* this
  feature today.
- **P3 — Tereza, 34 · Member · iPhone, bilingual**: edits her name
  occasionally (got married, changed surname). Tereza is the
  bilingual + mobile UX correctness check; both her experience on
  `/cs/account` and `/en/account` must be visually identical.
- **P5 — Pavel, 45 · Fresh-install club admin**: spec 009 pre-
  created his user row with `name = 'pavel'` (the email local-part).
  His FIRST stop after landing on the home screen is `/account` to
  fix this to `Pavel Šafařík`. Pavel is the persona that proves the
  spec 009 → spec 010 handoff: the wizard left a stub name, this
  spec lets him replace it.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Member edits own display name (Priority: P1)

A signed-in member navigates to `/account` (via the existing
greeting link on the home header). The page shows their current
display name in an editable field. They change it, submit, the
write commits, and any subsequent page render — most visibly the
greeting on `/home` — reflects the new name.

**Why this priority**: This IS the feature. Every other element of
the spec (the stub rows, the page chrome) is window dressing
around this one acceptance scenario.

**Independent Test**: Sign in as any seeded member with
`displayName = 'Original Name'`. Navigate to `/account`. Confirm the
name field is pre-filled with `'Original Name'`. Change it to
`'New Name'`, submit. Confirm: (a) success indication renders on
`/account`, (b) navigating to `/` shows `Ahoj New Name` in the
header, (c) the same value is persisted to BOTH the user row AND
the member row in the database (the two must stay in lock-step
because different surfaces read from different tables).

**Acceptance Scenarios**:

1. **P1 (Standa, fixing a typo)** — **Given** he is signed in with `displayName = 'Standa Novák'`, **When** he opens `/account`, edits the field to `Standa Novak` (no diacritic), and submits, **Then** the page shows the success state AND on next navigation to `/` his greeting reads `Ahoj Standa Novak` AND the underlying member row + user row both store `'Standa Novak'`.
2. **P3 (Tereza, surname change)** — **Given** she is signed in with `displayName = 'Tereza Černá'`, **When** she changes the field to `Tereza Bílá` and submits, **Then** every screen that names her (home greeting, member list, payment claims, history) shows the new name from the next render onward — there is no stale cache visible to her or to anyone else.
3. **P5 (Pavel, fixing the auto-derived stub)** — **Given** spec 009 just left him with `displayName = 'pavel'` (the email local-part), **When** he opens `/account` and changes it to `Pavel Šafařík`, **Then** subsequent /admin/members lookups for HIM show `Pavel Šafařík` AND his own `/` greeting reads `Ahoj Pavel Šafařík` AND any future email he triggers (e.g., inviting a new member) renders his sender name as `Pavel Šafařík`, not `pavel`.

---

### User Story 2 — Validation prevents bad input (Priority: P2)

The same form rejects empty input, whitespace-only input, and
input longer than 80 characters with inline error messages. The
prior value remains in the field across a failed submit so the
user can correct without retyping.

**Why this priority**: P2 because US1 happy-path is the persona
blocker; validation is a quality bar around it. But US2 is fully
independent — the validation schema can be unit-tested without the
DB layer.

**Independent Test**: With any signed-in member, submit each of:
empty string, `'   '` (whitespace-only), 80-char string (boundary,
should pass), 81-char string. Confirm the first three trigger
inline errors and the fourth saves successfully; in every failure
case the user row + member row are unchanged in the database.

**Acceptance Scenarios**:

1. **P1 (Standa, accidental backspace-all)** — **Given** he is editing his name, **When** he clears the field and submits, **Then** an inline error reads "Doplň své jméno" AND no DB write happens.
2. **P3 (Tereza, pastes a huge string)** — **Given** she pastes a 200-character string from another app, **When** she submits, **Then** an inline error reads "Maximálně 80 znaků" AND her 200-char paste remains in the field so she can shorten it without re-pasting.

---

### User Story 3 — Stub rows signal future extension (Priority: P3)

Below the editable name field, the page renders three rows that
look like account settings but are marked as "coming later":
email address (display-only, with a "later" badge), PIN ("set up
on this device" with a "later" badge), and "sign out from all
devices" (disabled CTA with a "coming soon" badge). These rows
are pure UI — no server actions, no backend integration. They
exist to make the page feel intentional and to signal where
future specs (email change, PIN reset, mass-revoke) will slot in.

**Why this priority**: P3 because this is UX scaffolding, not
functional behaviour. The page would technically work without
these rows; they just make it feel less empty and pre-shape the
information architecture.

**Independent Test**: Visit `/account`. Confirm the three stub
rows render below the editable form, in the order: email, PIN,
sign-out-all. Each shows its label, current value (where
applicable), and a "later" / "coming soon" badge. None are
interactive (no click, no focus ring, no form). The email row
displays the member's actual email from the user record (read-
only). The PIN row displays a generic string like "PIN is set on
this device" without revealing any actual PIN material. The
sign-out-all row's button is `disabled` and visually subdued.

**Acceptance Scenarios**:

1. **P3 (Tereza, exploring the page)** — **Given** she lands on `/account` for the first time, **When** she scrolls past the name field, **Then** she sees the three stub rows clearly distinguished from the editable area (visually subdued, badge-marked), AND tapping the disabled sign-out-all button produces no action.
2. **P5 (Pavel, sees his own email)** — **Given** he bootstrapped with `pavel@example.test`, **When** he opens `/account`, **Then** the email stub row displays `pavel@example.test`, confirming the page is reading from his real account record.

---

### Edge Cases

- **Two browser tabs editing simultaneously**: member opens
  `/account` in two tabs, edits in tab A and submits, then edits
  in tab B (which still shows the old value) and submits. v1.10
  accepts last-write-wins; this is a single-user single-row write,
  the second submit silently overwrites with the second value.
  Future spec could add optimistic-concurrency guards if needed.
- **Member edits name then signs out before refresh**: the write
  committed pre-sign-out; on next sign-in the new name is in
  place. No special handling needed.
- **Admin views the member list while a member is mid-edit**: the
  admin sees whichever value is committed at render time —
  classic eventual-visibility, no transactional concern.
- **Member with no `members` row** (bootstrap-pending state — see
  spec 009 data-model state A): cannot reach `/account` because
  the (app) layout's auth gate requires a session AND a
  members row. State A's user has neither for themselves. The
  spec 008 promotion hook guarantees the members row exists by
  the time a session does. So this edge case is structurally
  impossible by the time `/account` is reachable.
- **Member's name contains characters the email rendering can't
  encode** (emoji, RTL, etc.): the v1.10 schema accepts any
  Unicode the trim+length check passes. Email templates already
  use UTF-8 throughout (spec 007); rendering is a downstream
  concern, not a write-time validation concern.

## Requirements *(mandatory)*

### Functional Requirements

#### Route + access

- **FR-001**: System MUST render an account page at `/account` (under the existing `(app)` route group, inheriting its auth gate). The page MUST be reachable by any signed-in member, regardless of role.
- **FR-002**: Visitors without a valid session MUST be redirected to `/sign-in` (handled by the existing layout gate; no new redirect logic).
- **FR-003**: The header greeting on `/home` (which already links to `/account`) MUST resolve to the new page; the link target is unchanged, only the destination is new.

#### Editable display name

- **FR-004**: The page MUST present a single text input pre-filled with the member's CURRENT display name.
- **FR-005**: System MUST validate the submitted display name with these rules and report failures inline on the form, preserving the user's input on re-render:
  - Trim leading/trailing whitespace, then require length ∈ [1, 80].
  - Empty / whitespace-only input → an inline error referencing a catalog key like `account.errors.displayNameRequired`.
  - Over 80 chars → an inline error referencing `account.errors.displayNameTooLong`.
- **FR-006**: On a valid submit, the system MUST persist the trimmed value to BOTH places in a single atomic transaction:
  - The `users` row's `name` column for the current user (Better Auth's identity record).
  - The `members` row's `display_name` column for the current user's member entry.
  These two MUST stay in lock-step because different surfaces read from different tables (most app surfaces read members; Better Auth + some auth flows read users).
- **FR-007**: After a successful write the system MUST invalidate any cached page that renders the member's name (most notably the home page header). On next navigation the new name MUST be visible — no manual refresh required.
- **FR-008**: The page MUST present a clear success state after the write commits (in-place update, toast, or page re-render — implementation choice, but the UI MUST acknowledge the save).

#### Stub rows (UI-only, no backend)

- **FR-009**: Below the editable form, the page MUST render three rows in this order, each clearly marked as not-yet-editable:
  1. **Email** — shows the member's email from the user record; no edit control; carries a `later` badge.
  2. **PIN** — shows a generic "PIN is set up on this device" string; carries a `later` badge; no link.
  3. **Sign out from all devices** — disabled button with a `coming soon` badge; no action attached.
- **FR-010**: The three stub rows MUST NOT trigger any server action when interacted with. The disabled state MUST be both visual AND functional (DOM `disabled` attribute on the button, no `<a>` href that would navigate).

#### i18n

- **FR-011**: All visible strings (title, subtitle, field label + placeholder, submit, success message, error messages, badge labels, stub row labels) MUST flow through `next-intl` under a new `account.*` namespace with full catalog parity between `messages/cs.json` and `messages/en.json`. `pnpm i18n:check` MUST pass.

#### Compatibility

- **FR-012**: Existing surfaces that render `member.displayName` (home greeting, /admin/members list, payment claims, history pages) MUST require zero changes — they continue reading from the same column the action writes to.
- **FR-013**: The existing invitation flow at `acceptInvitationAction` (which sets the initial displayName) MUST require zero changes. The new account page is a SECOND write-path to the same columns, not a replacement.

### Key Entities

No new entities. v1.10 writes to existing columns:

- **`users.name`** (Better Auth table) — the identity-layer name. The new action's primary write target #1.
- **`members.display_name`** — the app-layer display name. Primary write target #2, kept in lock-step with `users.name` by the action's single transaction.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member can correct a typo in their display name in under 30 seconds end-to-end (page open → edit → submit → success indication), measured on a mid-range mobile device.
- **SC-002**: After a successful write, 100% of subsequent page renders that show the member's name render the NEW name — no stale-cache cases.
- **SC-003**: The two write targets (`users.name` AND `members.display_name`) are ALWAYS in lock-step after a v1.10 write. Verified by integration test that inspects both rows after every successful action invocation.
- **SC-004**: The three stub rows render on 100% of `/account` visits in both locales and never trigger any server-side action. Verified by Playwright assertion that they exist + are disabled.
- **SC-005**: i18n parity — all `account.*` keys exist in both catalogs; `pnpm i18n:check` passes. Verified per commit.
- **SC-006**: A validation failure (empty, whitespace, over-80-chars) round-trips in under 200 ms server-side, inserts zero rows, and preserves the user's input on re-render. Verified by unit test.

## Assumptions

- **Display name is a free-form string, not a structured name**. We do not split first/last; we do not enforce capitalisation; we do not validate against any character set beyond Unicode-printable. Members type whatever they're called.
- **80 chars is the upper bound**. Picked to match common name-field conventions; matches the existing `acceptInvitationSchema`'s implicit `displayName` length expectation (which has no explicit max but the invitation form clamps practically).
- **No identity-collision check**. Two members with the same display name is fine and common (e.g., two "Standa" in the same club). The system disambiguates by member id, never by display name. v1.10 does NOT enforce uniqueness.
- **No audit log entry** for the rename. The user is editing their OWN record; this is not a compliance event. The natural `users.updatedAt` / `members.updatedAt` timestamps capture the change.
- **The success indication uses the existing `sonner` toast** (already wired across the app's other action surfaces, e.g., spec 008's admin form). No new notification primitive.
- **The stub rows are functional UX scaffolding, not commitments**. Future specs may rename them, reorder them, replace them, or drop them entirely. v1.10 promises only that they look intentional today, not that they constrain tomorrow.
- **Header greeting link to `/account` is already in place** (landed pre-009 as part of the home redesign); v1.10 only adds the destination. Verify during /speckit-plan that the link target hasn't changed.

### Out of Scope (explicitly)

- **Email change flow** (Better Auth re-verify + dual-write of users.email + members.email). Separate spec.
- **PIN change / reset flow** (existing `setPinAction` supports rotation when current PIN is known; the dedicated UX with "forgot PIN" recovery is a separate spec).
- **Sign out from all devices** (Better Auth session-table mass-revoke + the UX around "you'll have to sign in fresh on every device"). Separate spec.
- **Avatar / profile photo upload** (Vercel Blob or equivalent + storage cost discussion). Separate spec.
- **User-level locale preference**, distinct from per-page locale selection (the existing language switcher is per-visit-cookie; a sticky per-user preference is a different feature). Separate spec.
- **Admin editing OTHER members' display names**. v1.10 is each user editing their OWN. Admin-edit-others is a separate spec with different RBAC.
- **Uniqueness constraints** on display names within a club. v1.10 explicitly allows duplicates.
- **Email change re-verification** flow.

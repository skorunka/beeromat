# Research: Custom Drink-Session Titles

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-05-27

All three open design questions were resolved during
`/speckit-clarify`. This file records the rationale + the
alternatives evaluated.

## Decision: any active member can set/edit (Q1 → A)

**Decision**: Any active member of the club can set or edit
any session's title. The server action checks `requireUnlocked()`
+ active-member-in-club; no role gate beyond that.

**Rationale**:
- Matches the project's "small group, high trust" pattern.
  Spec 019 already lets any member log a beer on behalf of any
  other member; naming a shared session is a strictly less
  privileged action.
- A friend group of 8–12 members doesn't need gatekeeping for
  a title. Last-write-wins handles the rare "someone changed
  my title" case the same way it handles concurrent picker
  edits (spec 020).
- Adding a permission gate (option B / C) would mean treasurer
  involvement for naming "Středeční debly" — corporate
  overhead with no real benefit.

**Alternatives considered**:
- *Option B (session opener + club_admin)*: rejected. Ownership
  semantics would require tracking + displaying "this was named
  by X" — extra UI surface for no payoff.
- *Option C (treasurer + club_admin only)*: rejected. Too
  restrictive for the use case.

## Decision: any session, current or past, is editable (Q2 → β)

**Decision**: The server action accepts a `sessionId` arg and
updates any session within the caller's club. No time-based
restriction (no "undo window," no "current-session-only").

**Rationale**:
- US2 in the spec explicitly calls out the retroactive use
  case — treasurer reconciling last month's "Round / Round /
  Round" entries names them as they reconcile. Locking edits
  to the live session would make this impossible.
- Same DB call (`UPDATE drink_sessions SET title WHERE id =
  $1 AND club_id = $2`) — no extra complexity vs the live-only
  alternative.
- The trust model from Q1 covers any-time edits — same as
  Q1's rationale, the friend group doesn't need a temporal
  gate either.

**Alternatives considered**:
- *Option α (current-session only)*: rejected. Drops US2; the
  retroactive case is the strongest reason for the feature.

## Decision: affordance on both /tab and /history/[sessionId] (Q3 → III)

**Decision**: The inline-edit affordance is rendered at two
mount points:
- `/tab` — the live session's subtitle becomes inline-editable
  when an open session exists.
- `/history/[sessionId]` — the page H1 becomes inline-editable
  for any session (current or past).

Same client component, same server action. Two mount points so
both the during-the-night and the retroactive-reconciliation
flows are reachable without navigation hopscotch.

**Rationale**:
- /tab is where members already are during a session — the
  natural place to name what's happening as it happens.
- /history/[sessionId] is the discovery surface for past
  sessions — the natural place to name "the one from
  2026-04-12" weeks later.
- Picking only one would leave half the use case awkward.
- Component-reuse cost is negligible — one well-typed
  client component takes both mounts.

**Alternatives considered**:
- *Option I (only /tab)*: rejected. Past sessions get no edit
  surface; US2 dies.
- *Option II (only /history/[sessionId])*: rejected. Naming
  the current session would require navigation away from /tab
  during a session — wrong friction at the wrong moment.

## Pattern reuse from prior specs

- **Spec 010 AccountForm** — same inline edit + Save UX as the
  display-name field. Direct template for the inline-edit
  component's interaction model.
- **Spec 020 `setAvatarAction` + optimistic update** —
  `setSessionTitleAction` mirrors the discriminated-union
  result shape (`{ ok: true } | { ok: false; code: ... }`) +
  the optimistic UI pattern.
- **Spec 021 `validateAvatarBytes`** — unit-test pattern for
  the title-shape Zod schema applies directly.
- **`drink_sessions.title` column** — already exists with the
  right shape; this feature just activates it. Zero schema
  cost.

## Open notes for implementation

- Trim trailing whitespace at the action boundary AND in the
  Zod schema; the UI also trims on blur for a "what you see
  is what you saved" feel.
- Save-on-blur AND save-on-Enter; Esc cancels. Standard
  inline-edit conventions; covered in the component test.
- `revalidatePath` calls: `/`, `/tab`, `/history`, and
  `/history/[sessionId]` — every surface that displays the
  title. Cheap, no perf concern.

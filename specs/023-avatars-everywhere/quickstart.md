# Quickstart: Avatars Everywhere

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-05-27

Manual walkthrough that verifies every in-scope surface picked
up an avatar. Run after `/speckit-implement` finishes.

## Setup

1. Boot the dev server: `pnpm dev` (use the `/dev` skill —
   docker + dev server + monitor in one shot).
2. Sign in as a `treasurer` or `club_admin` of a club that has
   ≥3 members with a mix of:
   - one member who uploaded a photo (e.g. via `/account` →
     upload form),
   - one member who picked a glyph but didn't upload (e.g.
     `trophy` or `beer-mug`),
   - one member with neither (Standa-persona — initials
     fallback).
3. Confirm the open drink-session has at least one consumption
   from each of those three members (use `/log/for` to log
   on someone's behalf if needed). Run the session through
   at least one bet transfer so `/bet` past-bets has data.
4. Have at least one pending payment claim sitting on
   `/admin/pending` so the treasurer queue isn't empty.

## US1 — Treasurer recognizes payers (`/admin/pending`)

Navigate to `/admin/pending`.

**Expected**:

- Each "K potvrzení" row shows the payer's avatar (`size="row"`,
  h-8 w-8) to the left of the existing payer name + amount.
- Members with uploaded photos render their photo.
- Members with glyphs render the glyph.
- Members with neither render initials.
- Layout matches: rows have the same height regardless of
  which avatar variant lands. No horizontal shift relative to
  the current text-only state.
- Clicking the existing "Dorazilo" button still confirms the
  payment.

Scroll down to "Právě potvrzené":

- Each confirmed row also shows the payer's avatar at row
  size.
- The Undo ("Vrátit") button still works as before.

## US2 — Bet-time recognition (`/bet`)

Navigate to `/bet` (while the session is open).

**Expected**:

- "Co si můžeš vzít" list — each entry shows the owner's
  avatar (`size="inline"`, h-5 w-5) on the left, beer name +
  owner name to the right. The avatar reads as a small inline
  recognition cue.
- "Sázky tohohle kola" list — each youTook / tookYours
  message has the involved members' avatars inline before
  their names.
- "Beru si ho" buttons still work — clicking transfers the
  drink and the row moves to past-bets unchanged.
- If the session has no transferable consumptions, the empty
  state copy still renders unchanged (no avatar artifact).

## US3 — On-behalf attribution (`/tab`)

Navigate to `/tab` as the member that had a beer logged on
their behalf.

**Expected**:

- The on-behalf consumption row shows the logger's avatar
  (`size="inline"`, h-5 w-5) before the existing "od {logger}"
  subtitle.
- Self-logged rows are unchanged — no avatar added.
- Lost-bet rows ("z prohrané sázky: …") are unchanged.
- Match-origin rows ("ze zápasu →") are unchanged.

## US4 — Session history (`/history/[sessionId]`)

Navigate to `/history`, tap any session that has bet
transfers, open its detail page.

**Expected**:

- The "Výměny sázek" section shows each transfer row with
  both members' avatars (`size="inline"`) before their names
  in the youTook / tookYours strings.

## Edge / regression checks

- A member with no avatar (Standa-persona) renders the
  initials chip on every surface — no broken image icon, no
  empty space.
- The `/history` list page (the session-list) is unchanged
  — out of scope for this spec.
- The home page is unchanged — out of scope.
- The settle screen is unchanged — out of scope (treasurer
  bank details only; no member name to attach an avatar to).
- The `/account` avatar picker still works (spec 020 + 021).
- The AppHeader user-menu avatar still renders at `size="default"`
  (h-9 w-9) — the backwards-compat path on `MemberAvatar`.
- `/admin/members` roster avatars still render at their current
  size (call site continues to use `className="h-10 w-10"`).

## Done when

- All five in-scope surfaces show avatars at the right size
  variant.
- No regression on existing row interactions
  (Confirm / Beru si ho / Undo).
- Standa-persona rows render initials cleanly on every
  surface.
- `pnpm test:unit && pnpm test:integration && pnpm test:component
  && pnpm i18n:check && pnpm forms:check && pnpm typecheck &&
  pnpm lint && pnpm build` is green.

# Quickstart: Fun Avatar Picker

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-05-27

End-to-end smoke walk through what a member experiences after this
feature ships. Used as the integration scenario for the
implementation phase; not an automated test.

## Setup

1. App is running locally (`pnpm dev` on the standard port).
2. You're signed in as any member of a club (any role).
3. Migration `drizzle/0008_<name>.sql` has been applied (adds
   `members.avatar_key`).

## Walkthrough

### 1. See the default state

- Open the app — the AppHeader top-right shows your initials in
  the amber circle (or `<CircleUser />` if your displayName is
  empty). UNCHANGED from today's behaviour.
- Click the avatar circle to open the user-menu dropdown.
- Click **Účet** (the "Account" row).

### 2. Find the picker

- On `/account`, scroll to (or land at — depends on placement
  decision in implementation) the **Profilová ikona** section.
- See a grid of 8–12 avatar tiles + a "Default (initials)" tile.
- The "Default (initials)" tile is visually marked as currently
  selected (you've never picked an avatar).

### 3. Pick an avatar

- Tap the beer-mug 🍺 tile.
- The tile briefly pops (`feedback-playful-motion-ok` flourish —
  scale up, settle, optional sparkle).
- The picker re-renders with the beer mug marked as current.
- Open the user-menu in the AppHeader — your avatar circle now
  shows the beer mug SVG inline, NOT your initials.

### 4. See it everywhere

- Navigate to `/admin/balances` (if you have the role) and look
  for your own row — the beer mug appears next to your display
  name.
- Have another member tap a beer they're logging "on behalf" of
  someone — the "od X" attribution line uses the same renderer,
  so X's avatar (if picked) appears next to their name.
- The picker, the header, and any admin / treasurer / on-behalf
  surface all render the same `<MemberAvatar />` component.

### 5. Reset to initials

- Back on `/account`, tap the **Default (initials)** tile.
- The picker re-renders with the default tile marked.
- Open the user-menu — your circle is back to your initials.
- A reload (or new session, new device) confirms persistence —
  the cleared state stays cleared.

## Verifications (manual, no automation)

- [ ] The picker fits in one viewport on a 360×640 phone (SC-004).
- [ ] Tapping a tile saves WITHOUT a separate Save button (FR-003).
- [ ] No regression for members who never pick an avatar — their
      initials display exactly as before (SC-003).
- [ ] Glyph appearance is identical on Windows + macOS + iOS +
      Android (SC-005, FR-010).
- [ ] All copy is Czech-first, no "dlužíš" anywhere.

## What good looks like

A member who's never opened `/account` sees no change. A member
who has picked an avatar sees their pick everywhere they used to
see their initials, with the same h-9 w-9 amber circle styling
intact. The treasurer can still tell members apart by display
name even when two members pick the same glyph.

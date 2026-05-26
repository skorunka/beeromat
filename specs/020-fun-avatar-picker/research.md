# Research: Fun Avatar Picker

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-05-27

All three open design questions were resolved during
`/speckit-clarify`. This file records the rationale + the
alternatives considered, in the format `/speckit-plan` Phase 0
expects.

## Decision: storage on `members.avatar_key`

**Decision**: Add a nullable `members.avatar_key text` column. The
chosen key is stored per club seat; null means "use the default
(initials / icon)".

**Rationale**:
- Constitution Principle II (Tenant-Aware Schema) is satisfied by
  construction — every row carries `club_id`, the action looks up
  the actor's active membership row via the existing
  `requireUnlocked()` chassis.
- The Assumptions section in spec.md already commits to "per-club
  seat" behavior. The simplest implementation matches.
- Multi-club future is preserved: if cross-club identity becomes
  desirable, a `users.default_avatar_key` fallback can layer on
  top without migrating existing data.
- One nullable column, one column added to the existing migration
  flow — no new tables.

**Alternatives considered**:
- *Store on `users` (cross-club identity)*: rejected. Would change
  the spec's per-club assumption and require a more invasive
  refactor of how member glyphs are rendered (they'd need to join
  to `users` from every consumption / payment surface).
- *Hybrid (`users.default_avatar_key` + `members.avatar_key`
  override)*: rejected for v1 — adds an extra resolution rule for
  zero current value. Can be added later cheaply because the
  per-member key already exists.
- *Separate `member_avatars` table*: rejected. One-to-one with
  members, no historical values needed, no per-row metadata. A
  column is the right shape.

## Decision: inline-SVG glyph rendering

**Decision**: Every avatar in the palette ships as an inline SVG
component. No emoji rendering, no external image files.

**Rationale**:
- Windows ships no Regional Indicator Symbol glyphs (flag emoji)
  and renders inconsistent style variants for several others
  (`🍻` colour vs monochrome depends on font). Inline SVG removes
  the variance entirely — the same pixels render on every
  platform.
- Precedent already in the repo: `components/ui/flag-icon.tsx`
  (this session) uses inline SVG for the same reason; the avatar
  picker can mirror the pattern (`code` prop → switch over a
  `Record<string, { viewBox, body }>` map).
- Brand control: the beer / tennis-themed glyphs can be shaped
  to feel cohesive with the Clubhouse colour tokens; emoji are
  whatever the OS gives you.
- Bundle cost is small: 8–12 glyphs × ~300 bytes each ≈ <5 KB
  gzipped, tree-shakeable if only some are imported (though we
  ship the full palette eagerly because the picker shows them
  all on one screen).

**Alternatives considered**:
- *Pure emoji palette*: rejected (per clarify Q2). Fast to ship
  but FR-010 (cross-platform consistency) was a hard requirement
  the user reaffirmed via Option B.
- *External image files served from `/public/avatars/`*:
  rejected. Adds an asset hosting concern + a request per avatar
  (or a sprite sheet) for zero render-quality benefit over
  inline SVG. Inline also lets the SVG inherit `currentColor`
  for theme-aware tinting.
- *Twemoji / OpenMoji CDN*: rejected. External dependency, no
  offline guarantee, brand cost (third-party look-and-feel).

## Decision: picker lives in a new `/account` section

**Decision**: The picker is a new `<AvatarSection />` rendered near
the top of `/account/page.tsx`. The existing user-menu "Účet" row
is the discovery path — no second link.

**Rationale**:
- `/account` is the canonical home for personal profile settings;
  the avatar is a profile setting.
- The user-menu dropdown is already crowded after this session's
  polish work (identity header, Account row, language radio
  group, sign-out). Cramming a 12-tile palette in there would
  dominate the dropdown.
- SC-001 ("change avatar in 3 taps or fewer") is met: avatar
  trigger (1) → Account row (2) → tap glyph (3).
- Server component for the page + client component for the
  picker grid. The picker calls the server action; the page
  re-renders on the next navigation tick.

**Alternatives considered**:
- *Inline palette in the user-menu dropdown*: rejected (per
  clarify Q3). Discoverability is highest there but the
  dropdown gets visually overloaded.
- *Both — `/account` canonical + a dropdown deep-link*: rejected
  for v1 — the existing "Účet" row already deep-links to
  `/account`. Two links to the same place is noise.

## Pattern reuse from this session

- **FlagIcon SVG pattern** (`components/ui/flag-icon.tsx`):
  exact template for `<MemberAvatar />`. Same `code` prop →
  `FLAGS[code]?.body` shape, same h-N w-N styling, same
  `aria-hidden` on the SVG.
- **Server-action result discriminated union** pattern used in
  spec 019 actions (`{ ok: true; ... } | { ok: false; code: ... }`)
  applies directly to `setAvatarAction`.
- **Component-test pattern** for spec 019 components
  (`tests/component/*`) uses `vi.mock()` for the server action;
  same approach for `avatar-picker.test.tsx`.
- **Initials helper** in `components/nav/user-menu.tsx` (lines
  37-42, `initials(name)`) — promote to `lib/avatars/initials.ts`
  so the new `<MemberAvatar />` can reuse it without importing
  from a UI component.

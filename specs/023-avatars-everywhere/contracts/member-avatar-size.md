# Contract: `MemberAvatar` `size` prop

**Spec**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md) | **Date**: 2026-05-27

The single component-API change this spec introduces. The
existing render-path precedence chain (upload → glyph → initials
→ CircleUser fallback) is unchanged; only the wrapper's
dimensions vary by `size`.

## Signature

```ts
export type MemberAvatarSize = 'default' | 'row' | 'inline';

interface MemberAvatarProps {
  avatarKey: string | null;
  displayName: string;
  uploadUrl?: string | null;
  size?: MemberAvatarSize; // defaults to 'default'
  className?: string;
}
```

## Size variants

| `size`     | Wrapper classes              | Used by |
|------------|------------------------------|---------|
| `default`  | `h-9 w-9 text-sm`            | AppHeader user-menu, `/admin/members` roster. Pre-spec-023 behavior. |
| `row`      | `h-8 w-8 text-sm`            | `/admin/pending` pending + recently-confirmed lists (US1). |
| `inline`   | `h-5 w-5 text-[10px]`        | `/tab` on-behalf attribution (US3), `/bet` lists (US2), `/history/[id]` bet-transfer rows (US4). |

The shared classes (rounded-full, bg/text colors, flex
centering, overflow-hidden) stay identical across variants.
Only the height/width and the text-size scale.

## Inner element sizing (within the wrapper)

- `<img>` fills the wrapper: `h-full w-full object-cover`
  (unchanged).
- Glyph SVG scales with the wrapper: stays at `h-5 w-5` for
  default + row variants; uses `h-3 w-3` for inline so the
  glyph fits inside the smaller circle without clipping.
- Initials text uses the wrapper's `text-…` class so the two
  letters fit naturally — at h-5 the existing `text-sm` looks
  too big; `text-[10px]` reads as a tight monogram.
- `<CircleUser />` lucide icon stays at `h-5 w-5` for default
  + row variants; `h-3 w-3` for inline.

## `className` interaction

`className` continues to be appended last via `cn(...)`. Call
sites can still nudge spacing/margin without re-deriving the
wrapper geometry. Overriding `h-…` / `w-…` directly via
className still works (Tailwind's cascade picks the later
class) — but doing so means the inner glyph/icon won't match;
prefer `size` for the canonical variants.

## Backwards compatibility

All existing call sites that omit `size` get `default` —
identical to today's behavior. The AppHeader user-menu, the
`/admin/members` roster, and the `/account` avatar picker all
keep their current dimensions without code change.

## Test obligations

`tests/component/member-avatar.spec.tsx` (extended):

1. **Default size unchanged** — omitting `size` renders the
   wrapper at the current default (`h-9 w-9`).
2. **`size="row"` renders at h-8 w-8** — the wrapper carries
   the expected classes.
3. **`size="inline"` renders at h-5 w-5** — the wrapper
   carries the expected classes; the inner glyph (when an
   `avatarKey` is set) is scaled down accordingly.
4. **Fallback chain preserved per size** — for each of the
   three sizes: a member with an `uploadUrl` renders `<img>`;
   a member with a valid `avatarKey` renders the glyph; a
   member with neither renders initials; an empty-name
   member renders `CircleUser`.
5. **`className` still appends** — passing `className="ml-2"`
   adds the class to the wrapper without breaking the
   size-variant classes.

(Test obligations for the integration-layer query shape
extensions live in their own per-query spec files —
`tests/integration/<query-name>-avatar-fields.spec.ts` —
each verifying that seeded members' avatar fields surface in
the corresponding result row.)

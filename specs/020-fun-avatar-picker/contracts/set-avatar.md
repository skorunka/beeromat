# Contract: `setAvatarAction`

**Spec**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md) | **Date**: 2026-05-27

The single server action this feature adds. Lives in
`app/[locale]/(app)/account/actions.ts` (existing file —
co-locates with the other account-scoped actions).

## Signature

```ts
import type { AvatarKey } from '@/lib/avatars/palette';

export type SetAvatarResult =
  | { ok: true }
  | { ok: false; code: 'INVALID_KEY' | 'NO_MEMBERSHIP' };

export async function setAvatarAction(input: {
  avatarKey: AvatarKey | null;
}): Promise<SetAvatarResult>;
```

`AvatarKey` is the union of strings in `AVATAR_KEYS`. `null`
means "clear my avatar, render the initials fallback."

## Preconditions

- Caller MUST have an unlocked session (`requireUnlocked()` —
  the same guard the rest of the app uses).
- Caller MUST have an active membership row in the current club
  (`ctx.member` set by the guard). The action operates on
  THAT membership row.

## Postconditions (happy path)

- `members.avatar_key` for the caller's active membership is
  set to the requested value (or `NULL` if the input was `null`).
- `revalidatePath('/')` and `revalidatePath('/account')` fire so
  the AppHeader avatar + the picker selection state update on the
  next render tick.
- Returns `{ ok: true }`.

## Failure cases

| Code | When |
|------|------|
| `INVALID_KEY` | `input.avatarKey` is a non-null string that is not in `AVATAR_KEYS`. No write, no revalidation. |
| `NO_MEMBERSHIP` | The session is valid but the caller has no active membership in any club (edge — shouldn't occur via the UI, defensive). |

## Authorization

- Any active member of a club can set their OWN avatar.
- No role required (any role above `member`).
- No member can set another member's avatar (the action only
  writes to `ctx.member.id`).

## Input validation

```ts
const input = await args; // Server Actions auto-parse from FormData or JSON
if (input.avatarKey !== null && !isValidAvatarKey(input.avatarKey)) {
  return { ok: false, code: 'INVALID_KEY' };
}
```

Empty string is normalized to `null` defensively:

```ts
const key = input.avatarKey === '' ? null : input.avatarKey;
```

## Side effects

- One `UPDATE members SET avatar_key = $1 WHERE id = $2`.
- Two `revalidatePath` calls (no DB hit each, just the Next.js
  cache invalidation).
- No event log entry (per spec.md Assumptions — avatar changes
  are low-stakes, reversible, out of scope for the event log).

## Test obligations

Lives in `tests/integration/set-avatar-action.test.ts`. The
suite MUST cover:

1. **Happy set**: actor is a member, sends a valid key → row
   updated, `{ ok: true }` returned.
2. **Happy clear**: actor sends `null` → row's `avatar_key` is
   `NULL`, `{ ok: true }` returned.
3. **Empty string normalized**: actor sends `''` → treated as
   `null`, row's `avatar_key` is `NULL`, `{ ok: true }`.
4. **Invalid key rejected**: actor sends `'banana-republic'`
   (not in palette) → `{ ok: false, code: 'INVALID_KEY' }`, row
   unchanged.
5. **No-membership rejected** (defensive): session present but
   no active membership in current club → `{ ok: false, code:
   'NO_MEMBERSHIP' }`.

Each test seeds via the standard PGlite + Drizzle harness used
by spec 019 integration tests (no real Neon).

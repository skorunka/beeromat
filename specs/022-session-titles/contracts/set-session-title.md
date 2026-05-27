# Contract: `setSessionTitleAction`

**Spec**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md) | **Date**: 2026-05-27

The single server action this feature adds. Lives in
`app/[locale]/(app)/tab/actions.ts` (co-located with the page
that primarily owns the live session; `/history/[sessionId]`
imports the same action).

## Signature

```ts
export type SetSessionTitleResult =
  | { ok: true; title: string | null }
  | { ok: false; code: 'NOT_FOUND' | 'VALIDATION_FAILED'; fieldErrors?: Record<string, string[]> };

export async function setSessionTitleAction(input: {
  sessionId: string;
  title: string | null;
}): Promise<SetSessionTitleResult>;
```

## Preconditions

- Caller MUST have an unlocked session (`requireUnlocked()` —
  same guard the rest of the app uses).
- Caller MUST have an active membership in the same club as
  the target `sessionId`.
- `input.title` MUST be either `null` OR a string that, after
  trim, fits the schema (≤ 60 chars).

## Postconditions (happy path)

- `UPDATE drink_sessions SET title = $value WHERE id =
  $sessionId AND club_id = $callerClubId` runs.
- `$value` is the trimmed title, OR `NULL` if the trimmed
  input is empty.
- `revalidatePath('/')`, `revalidatePath('/tab')`,
  `revalidatePath('/history')`, and
  `revalidatePath(`/history/${sessionId}`)` fire so every
  surface that displays the title picks up the change on the
  next render tick.
- Returns `{ ok: true, title: $value }` so the optimistic UI
  can confirm the canonical state.

## Failure cases

| Code | When |
|------|------|
| `NOT_FOUND` | UPDATE affected 0 rows — session doesn't exist OR belongs to another club. Same code for both so we don't leak cross-club existence. |
| `VALIDATION_FAILED` | `input.title` (after trim) exceeds 60 chars OR the input is not a string/null. `fieldErrors` carries the per-field message(s). |

## Side effects

- One UPDATE on `drink_sessions`.
- Four `revalidatePath` calls (cheap — they only invalidate
  the Next.js cache).
- No event-log entry. Title is low-stakes social metadata
  (matches the spec-020 avatar precedent).

## Authorization

- Any active member of the club CAN edit any session in their
  club (per Clarifications Q1 → A).
- No role gate.
- Cross-club edits are blocked by the `WHERE club_id` clause
  in the UPDATE; the action returns `NOT_FOUND` instead of
  `FORBIDDEN` to avoid leaking the existence of other clubs'
  sessions.

## Test obligations

`tests/integration/set-session-title-action.spec.ts`:

1. **Happy set** — actor in club A sets the title of an open
   session in club A → returns `{ ok: true, title: 'foo' }`;
   DB row has the trimmed value.
2. **Happy clear** — actor sets `title: ''` → trimmed to '',
   stored as `NULL`; returns `{ ok: true, title: null }`.
3. **Whitespace-only clears** — `title: '   '` → stored as
   `NULL`.
4. **Trim** — `title: '  Středeční debly  '` → stored as
   `'Středeční debly'`.
5. **Over-cap rejected** — title > 60 chars after trim →
   `{ ok: false, code: 'VALIDATION_FAILED' }`; DB unchanged.
6. **Cross-club returns NOT_FOUND** — actor in club A tries
   to edit a session in club B → `{ ok: false, code:
   'NOT_FOUND' }`; club B's session unchanged.
7. **Retroactive (closed session)** — actor sets the title
   of a session whose `ended_at` is NOT NULL → succeeds
   (Q2 → β allows any-time editing).

`tests/unit/session-title-schema.test.ts`:

- Schema accepts a string up to 60 chars after trim.
- Schema rejects > 60 chars after trim.
- Schema converts empty / whitespace-only to null.
- Schema preserves Unicode (Czech diacritics + emoji).

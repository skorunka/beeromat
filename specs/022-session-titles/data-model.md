# Data Model: Custom Drink-Session Titles

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-05-27

## Schema

**No changes.** This feature reuses the existing
`drink_sessions.title text` column, which is already nullable
and currently always NULL for auto-opened sessions.

```sql
-- existing column on drink_sessions:
title text NULL
```

## Validation rules

Enforced both client-side (Zod schema in
`lib/validation/session-title.ts`) and server-side (re-validated
at the action boundary).

| Rule | Detail |
|------|--------|
| Max length | 60 characters (after trim) |
| Trim | Leading + trailing whitespace stripped on submit |
| Empty → NULL | An empty string (or whitespace-only) clears the title back to NULL — the renderer's "Round / Kolo" fallback applies |
| Unicode | Full Unicode accepted (Czech diacritics + emoji); no character-class restriction |

## Renderer fallback

Unchanged from today's behavior:

```
session.title (non-empty)     → render as-is
session.title is NULL         → render localized "Round / Kolo"
                                (history.drinkSession i18n key)
```

## Lifecycle

| Op | Trigger | DB effect |
|----|---------|-----------|
| Set | `setSessionTitleAction({ sessionId, title: '...' })` | `UPDATE drink_sessions SET title = $trimmed WHERE id = $sessionId AND club_id = $clubId` |
| Clear | `setSessionTitleAction({ sessionId, title: '' })` or `null` | Same UPDATE but `title = NULL` |

## Authorization

- Caller MUST be unlocked (`requireUnlocked()`).
- Caller's active membership MUST belong to the same club as
  the target session (the `WHERE club_id = $callerClubId` clause
  in the UPDATE enforces this — a cross-club session matches no
  rows and the action returns `NOT_FOUND`).
- No role gate beyond active-member (per Q1 → A).

## Data volume

- Each club has ~50 drink_sessions per year. Adding a title
  text per row is bytes-level, no scaling concern.
- No new indexes — title isn't a query predicate anywhere.

## Migration note

None. The column already exists (added with the original
`drink_sessions` table during spec 001). Nothing to apply.

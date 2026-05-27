# Contract: `GET /api/avatar/[memberId]`

**Spec**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md) | **Date**: 2026-05-27

New Route Handler at `app/api/avatar/[memberId]/route.ts`.
Serves the stored avatar image bytes for a given member.

## Request

```http
GET /api/avatar/<member-uuid>?v=<iso-timestamp-or-epoch-ms>
```

Path params:
- `memberId` — the UUID of the member whose avatar to serve.

Query params:
- `v` (optional) — cache-buster. The renderer passes
  `members.avatar_upload_at` here so changing the upload changes
  the URL → browser cache invalidates automatically. The handler
  ignores this param's value (it's purely client-side cache key
  shaping).

## Response — happy path

```http
HTTP/1.1 200 OK
Content-Type: image/jpeg          (whatever is stored)
Content-Length: 142876
Cache-Control: public, max-age=3600, immutable

<binary image bytes>
```

- `Content-Type` from `avatar_uploads.content_type` for the row.
- `Cache-Control: immutable` because the URL carries the version
  query param — any update to the upload produces a new URL.

## Response — not found

```http
HTTP/1.1 404 Not Found
Content-Type: text/plain; charset=utf-8

(empty body)
```

Triggers:
- No row exists in `avatar_uploads` for the given `memberId`.
- `memberId` is not a valid UUID format.
- `memberId` belongs to a different club from the caller's
  active session (cross-club isolation; spec Constitution II).

## Authentication

- The handler MUST require an unlocked session (same chassis as
  the rest of `(app)`).
- The handler MUST verify the requested `memberId` belongs to the
  caller's current club. Returns 404 (NOT 403) for cross-club
  IDs so we don't leak membership information by error code.

## Side effects

None. Read-only.

## Performance

- Single SELECT: `SELECT image, content_type FROM avatar_uploads
  WHERE member_id = $1`. Hits the UNIQUE index — O(log n).
- Bytes are streamed via `NextResponse(buffer, { headers })`.
  No additional copies.
- Cold p95 ≤ 100 ms (per plan.md Performance Goals).
- Hot (cached): browser serves from disk cache, no request hits
  the server at all.

## Test obligations

`tests/integration/avatar-route-handler.spec.ts`:

1. **Happy** — seed an avatar_uploads row → GET returns 200 with
   the right Content-Type + matching bytes.
2. **No upload** — member exists but no upload row → 404.
3. **Unknown member** — random UUID → 404.
4. **Bad UUID** — `/api/avatar/banana` → 404 (not 500).
5. **Cross-club** — member exists in club B, caller is in club
   A → 404.
6. **Cache headers present** — happy response includes the
   exact `Cache-Control: public, max-age=3600, immutable`.

(Cross-club is tested via the same multi-club fixture pattern
used in `tests/integration/void-on-behalf-authz.spec.ts`.)

# Quickstart: Member-name profile links (spec 036)

## Build

1. Edit `components/match/beer-iou-row.tsx` — wrap the avatar + label block in a
   `Link` to `/members/[debt.counterpartyMemberId]`; keep the buttons as siblings.
2. Edit `components/tab/tab-entry-row.tsx` — wrap the on-behalf "od {logger}" line
   (avatar + name) in a `Link` to `/members/[entry.loggerMemberId]` when present.
3. Add `tests/component/{beer-iou-row,tab-entry-row}.spec.tsx`.

## Gates

```bash
pnpm typecheck && pnpm lint && pnpm test:component && pnpm i18n:check && pnpm forms:check && pnpm build
```
(No `test:unit`/`test:integration` impact — nothing there changed. No E2E.)

## Manual verification (Docker MCP browser @ host.docker.internal:3010)

1. **IOU (US1)** — on a profile/home with an open IOU, tap the counterparty
   avatar/name → lands on their `/members/[id]` profile. Tap "Předáno"/"Odepsat"
   instead → the control still works (link didn't swallow it).
2. **Tab on-behalf (US2)** — on /tab, find a beer with "od {someone}", tap the name
   → that member's profile. A self-logged beer shows no member link.
3. **No nested anchors** — match-hub recent-results rows still navigate to the match
   (unchanged); no double-link behaviour anywhere.

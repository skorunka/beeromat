# Quickstart: Custom Drink-Session Titles

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-05-27

Manual end-to-end walkthrough.

## Setup

- App running locally (`pnpm dev`).
- Signed in as any member of a club.
- At least one open drink session AND one closed past session
  in the DB. Easiest way: log a beer to auto-open one, then
  manually close in SQL OR use seed data.

## Walkthrough

### 1. Name the live session from /tab

- Navigate to `/tab`.
- The subtitle below "Útrata" shows either the session's
  current title or "Kolo" (fallback).
- Tap the subtitle. It becomes an input pre-filled with the
  current value (or empty for a fallback session).
- Type "Středeční debly s Pardubicema".
- Press Enter OR tap outside the input (blur).
- Subtitle updates immediately. Toast confirms save (or input
  silently reverts to display mode — design choice during
  impl).

### 2. See it on /history

- Navigate to `/history`.
- The row for the open session now reads "Středeční debly s
  Pardubicema" (replacing the "Kolo" fallback).

### 3. Retroactively name a past session

- On `/history`, tap any past session card. You land on
  `/history/[sessionId]`.
- The H1 reads either the title or "Kolo".
- Tap the H1 → inline edit input with the current value (or
  empty). Type "Po finále s Plzní". Press Enter.
- H1 updates. Toast confirms.
- Navigate back to `/history`. The row updates.

### 4. Clear back to fallback

- On either surface, tap the inline edit, delete all text,
  press Enter (or blur).
- The H1 / subtitle reverts to "Kolo" / "Round".
- Confirmed unset: navigate away + back; still fallback.

### 5. Over-cap guardrail

- Tap the inline edit, paste a 200-char string (or type a
  wall of text).
- The input rejects characters beyond 60 OR shows a validation
  message on submit (depending on the impl). The saved value
  is ≤ 60 chars.

### 6. Editability for any member

- Sign in as a different active member of the same club.
- Open the same `/history/[sessionId]` page.
- The H1 is still editable — the trust model is any-active-
  member (Q1 → A). Save your edit; on next refresh the other
  member's value appears (last-write-wins, no conflict).

## Verifications (manual)

- [ ] Live session titling from /tab works (steps 1 + 2).
- [ ] Retroactive titling from /history/[sessionId] works
      (step 3).
- [ ] Empty / whitespace-only input clears back to fallback
      (step 4).
- [ ] Over-cap input is rejected (step 5).
- [ ] Any active member of the club can edit (step 6).
- [ ] Czech-first copy reads naturally; no English fragments
      in the inline-edit UX.
- [ ] Cross-club isolation: from a fixture with two clubs,
      member of club A cannot edit session of club B (the
      session won't be visible in the UI to begin with;
      defense in depth at the action layer).

## What good looks like

A member who organized Wednesday doubles taps the /tab
subtitle, types the session name in <10 seconds, and never
thinks about it again. Three weeks later the treasurer reading
/history can scan for "Středeční debly s Pardubicema" instead
of squinting at dates.

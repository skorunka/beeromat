# Quickstart / Manual Verification: Event Attendance (RSVP)

## Setup (admin)
1. As a club_admin, go to **Admin → Events**, create a series:
   "Úterý / 17:00 / Antuka". (Repeat for Thursday/Sunday to test multiple.)
2. Confirm this week's upcoming occurrence(s) appear immediately (the create
   action seeds them; the nightly cron keeps future weeks topped up).

## Member RSVP (US1)
3. As a regular member, open **Events** (bottom nav). You see **this week's**
   open sessions.
   - On Monday with Tue/Thu/Sun series → all three shown.
   - Later in the week → only the sessions still ahead.
4. Tap **Přijdu** on Tuesday → you appear in "Kdo přijde", headcount +1.
5. Tap **Nejdu** → you leave the going list, count −1. Reload → it stuck.
6. With few going → the playful low-turnout line shows.
7. After Tuesday 17:00 passes → that occurrence is shown closed; you can't
   change your answer; it's still viewable.

## Permissions (US4 — the sejdemse fix)
8. As a regular member, confirm there is **no** control to change anyone
   else's status — only your own row is editable.
9. As an admin, set another member's status → they show as going, attributed
   to you. Confirm a non-admin cannot do this.

## Admin exceptions (US3)
10. Cancel this Tuesday's occurrence → members see it cancelled, can't RSVP;
    next Tuesday unaffected.
11. Deactivate a series → no new occurrences generated; past ones remain.

## Beer link (US5) + independence
12. On an event evening, associate that night's drink session with the
    occurrence → the occurrence detail links to the tab.
13. **Independence check**: on a non-event day, a pair opens a session, plays
    their bet match, logs beer → works exactly as today, no event involved,
    `occurrence_id` null.
14. A member who didn't RSVP logs a beer on an event evening → logged normally
    (beer never gated on attendance).

## Cron
15. Hit `/api/cron/events` WITHOUT the secret → 401. With the correct
    `CRON_SECRET` → generates missing occurrences; run it twice → second run
    creates nothing (idempotent), RSVPs untouched.

## Gates
`pnpm typecheck` · `lint` · `test:unit` (window/time/turnout pure logic — incl.
a DST-transition case) · `test:integration` (RSVP upsert authz + idempotent
generation) · `test:component` (RSVP toggle, who's-coming, series form) ·
`build` · `i18n:check` · `forms:check` — all green. (E2E N/A per plan.)

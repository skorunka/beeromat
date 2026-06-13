# Quickstart: Achievements / Badges (spec 035)

How to build, run, and verify the feature locally.

## Prereqs

- Dev DB up (`docker compose up -d`, Postgres on `:15432`).
- Heavy seed loaded for realistic data: `pnpm db:seed:heavy` (~50 members, ~2 years).

## Build order (matches tasks.md phases)

1. **Schema + migration**: add `lib/db/schema/achievements.ts`, export it from
   `lib/db/schema/index.ts`, then `pnpm drizzle-kit generate` → produces
   `drizzle/0015_*.sql`. Apply locally with `pnpm drizzle-kit migrate` (or the
   project's migrate script).
2. **Stats extension**: add `distinctBeerTypes` + `sessionsAttended` to
   `MemberStats` and populate them in `getPlayerStats`.
3. **Pure core**: `lib/achievements/{types,predicates,catalog}.ts` + unit tests.
4. **Reconcile + read**: `lib/db/queries/achievements.ts`
   (`reconcileAchievements`, `getEarnedBadges`, `reconcileAllClubMembers`) +
   integration tests.
5. **Wire actions**: post-commit reconcile in `log/actions.ts` (3 actions) and
   `match/actions.ts` (1 action); add `unlockedBadges` to their results.
6. **UI**: `components/achievements/{achievements-section,badge-chip}.tsx`; render
   in `members/[memberId]/page.tsx`; component tests.
7. **Celebration**: in the client log/match-result components, on
   `result.unlockedBadges.length > 0` → `celebrateBeer()` + toast.
8. **i18n**: `achievement.*` keys in `cs` + `en`.
9. **Backfill**: `scripts/backfill-achievements.ts` → run once locally to populate
   existing members.

## Backfill locally

```bash
pnpm db:backfill:achievements
# stamps all currently-qualifying badges with a single release timestamp.
```

## Manual verification (Docker MCP browser @ host.docker.internal:3010, magic-link via Mailpit)

1. **Gallery (US1)** — open `/members/<a-veteran-id>`: the Achievements section
   shows ALL nine badges; earned ones (Century Club 💯 etc.) are vivid, dated, and
   sorted first; locked ones are dimmed with their condition + a progress bar
   ("64 / 100"); the header reads "N of 9". Open a brand-new member: all nine show
   locked at "0 / N" — never empty, never a crash.
2. **Backfill (US1/FR-009)** — confirm veterans show badges *immediately* after
   running the backfill, without logging anything new.
3. **Earn in the moment (US2)** — as a member sitting at 99 beers (seed/log up to
   99), log one more on `/log`: the 🍻 celebration fires and a toast names "Century
   Club 💯". Reopen their profile → the badge is there.
4. **Idempotent / no double (US2/SC-004)** — log beer 101: no second celebration,
   still one Century Club badge.
5. **Sticky (US2/FR-004/SC-003)** — void that 100th beer (within undo window or as
   stock_manager): the badge stays on the profile (not revoked).
6. **Multi-earn from one action (US2/FR-008)** — record a match that is both the
   member's 25th win and a 5-streak: both Winner 🏆 and On Fire 🔥 unlock together.
7. **Rarity (US3, if built)** — each badge shows a club-holder cue ("owned by 3 of
   28 members"); a badge nobody holds reads "nobody yet — be the first".

## Gates (all must pass before pushing to main)

```bash
pnpm typecheck
pnpm lint
pnpm test:unit          # achievement-predicates.spec.ts
pnpm test:integration   # reconcile-achievements.spec.ts (insert-if-absent, sticky, idempotent, backfill stamp)
pnpm test:component     # achievements-section.spec.tsx (earned/empty/locked, cs+en)
pnpm build
pnpm i18n:check         # achievement.* parity cs/en
pnpm forms:check        # no native inputs introduced
```

E2E: N/A for this feature (see plan.md Test layer declaration).

## Deploy note

After merge to `main`, Vercel runs `drizzle-kit migrate` (0015 applies, additive).
**Run the backfill once against prod** (`pnpm db:backfill:achievements` with
`DATABASE_URL` pointed at prod) so existing members get their historical badges with
the release stamp. The app works without it (badges would just accrue going forward),
but FR-009 wants veterans to see their badges on day one.

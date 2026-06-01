# Quickstart: Recreate Last Match

## What it does

On the `/match` hub, a member who has played at least one match sees a "Recreate" control labelled with the matchup they last played. One tap creates a fresh open agreement with the identical lineup, for-beer flag, and pairing, and drops them on the new match's detail page — no form.

## Manual walkthrough (dev)

1. `pnpm tsx --conditions=react-server --env-file-if-exists=.env.local scripts/clear-operational-data.ts` to start from a clean match slate (keeps club + members + beers).
2. Open `/match`, create a doubles match (e.g. Franta + Pepa vs Honza + Standa, for beer, straight) via the New-match form.
3. Reload `/match`. At the top, a **Recreate: Franta + Pepa vs Honza + Standa** control now appears.
4. Tap it → you land on a new open agreement's detail page with the same four players, for-beer, straight pairing.
5. Confirm the Upcoming list now shows two identical matchups (the original + the clone).

### Empty state
- As a member who has never played a match, `/match` shows no recreate control.

### Stale-lineup guard
- Block (via `/admin/members`) one of the four players from the last match.
- Back on `/match`, tap recreate → a clear error toast ("…no longer in the club"); no new agreement is created.

## Verify

```bash
pnpm test:integration tests/integration/last-agreement-for-member.spec.ts
pnpm test:integration tests/integration/recreate-last-match-action.spec.ts
pnpm test:component tests/component/recreate-last-match-button.spec.tsx
pnpm i18n:check
pnpm build
```

## Notes

- Recreate re-resolves the source server-side on tap (no client-trusted lineup), so it always clones the genuinely-latest match even if a newer one was created after the page loaded.
- The source agreement is never modified — recreate only appends a new one.

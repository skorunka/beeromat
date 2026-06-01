# Phase 0 Research: Recreate Last Match

All four critical design questions were resolved in the spec's Clarifications session (2026-06-01). This document records the technical decisions for implementation; there are no open `NEEDS CLARIFICATION` items.

## Decision 1 — Resolving "the member's last match"

**Decision**: Add `lastAgreementForMember(clubId, memberId)` to `lib/db/queries/match-agreements.ts`. It returns the single most-recently-created `match_agreements` row (by `createdAt` desc, limit 1) where the member appears in `match_agreement_sides`, scoped to the club, regardless of agreement state. Reuse the existing `OpenAgreementSummary` row-assembly shape (sides grouped A/B with seats + display names) so the hub can build the label with the existing `joinSideNames` helper.

**Rationale**: The spec's Q1 clarification fixed "last match" = the member's own most recent participated agreement, not club-wide. A participant-filtered, state-agnostic, createdAt-desc query is the direct expression of that. Limiting to 1 keeps it cheap; the existing `idx`-backed `match_agreement_sides` + `matchAgreements.createdAt` ordering makes it an indexed read.

**Alternatives considered**:
- *Club-wide last match* (original recommended option) — rejected by the Q1 clarification ("my last match").
- *Filtering `listOpenAgreementsForMember` in JS* — rejected: that helper is OPEN-only, but recreate must clone recorded/cancelled matches too. A dedicated state-agnostic query is correct.

## Decision 2 — Cloning the lineup into a create input

**Decision**: Map the resolved agreement's sides + format + forBeer + pairingKind into the existing `CreateAgreementInput` shape and call the existing `createAgreementTx`. No new create path.

**Rationale**: FR-006 mandates reusing the existing creation guards (members-in-club, duplicate-member). `createAgreementTx` already performs both. Building the `CreateAgreementInput` and delegating means recreate inherits every guard automatically and cannot diverge.

**Alternatives considered**:
- *A bespoke clone transaction that copies rows directly* — rejected: duplicates the insert + validation logic and risks drift from `createAgreementTx`.

## Decision 3 — Inactive-participant guard

**Decision**: Before delegating to `createAgreementTx`, the `recreateLastMatchAction` re-resolves the last agreement server-side (never trusts a client-passed lineup) and checks that every participant is still an **active** member of the club. If any is inactive/removed, return a typed `STALE_PARTICIPANT` error (carrying the offending display name when resolvable) and create nothing.

**Rationale**: `createAgreementTx`'s `assertAllMembersInClub` validates club membership but NOT active status — a deactivated-but-still-in-club member would pass it and produce an agreement with a blocked player. The spec's Q3 clarification requires a clean block. An explicit active-status check in the action closes that gap without changing the shared transaction's contract (which other callers rely on).

**Alternatives considered**:
- *Relax/extend `createAgreementTx` to check active status* — rejected for this spec: the New-match form's seat pickers already only offer active members, so the shared tx doesn't need the check, and adding it there could surprise other callers. Keep the active guard local to recreate.
- *Hide the button when any participant is inactive (Q3 Option C)* — rejected: requires a per-participant active lookup on every hub load. The action-time block is cheaper and equally safe.

## Decision 4 — Server-resolved source (no client trust)

**Decision**: `recreateLastMatchAction` takes **no lineup input**. It re-resolves the member's last agreement from the DB inside the action, then clones. The client button only triggers the action; it never sends the lineup it displayed.

**Rationale**: Constitution II (tenant scoping) + general trust-boundary hygiene. The displayed label is for the human; the authoritative source is re-read server-side under the member's session so there is no way to clone an agreement the member couldn't see. Also avoids a stale-label race (member opened the hub, a newer match was created, then they tapped — the action clones the genuinely-latest one).

**Alternatives considered**:
- *Pass `agreementId` from the button* — rejected: opens a (small) IDOR surface and a stale-vs-latest ambiguity. Re-resolving is one cheap query and removes both.

## Decision 5 — Empty state (no prior match)

**Decision**: The `/match` page resolves the last agreement server-side; when it is null, the `RecreateLastMatchButton` is simply not rendered. No client-side empty handling.

**Rationale**: FR-001 — render the control only when there is something to clone. A server-side presence check keeps the client component free of a null branch and matches the existing hub pattern (e.g. `OpenMatchPrompt` renders nothing on empty).

# Specification Quality Checklist: Achievements / Badges

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-06-13
**Feature**: [spec.md](../spec.md)

## Content Quality

- [X] No implementation details (languages, frameworks, APIs)
- [X] Focused on user value and business needs
- [X] Written for non-technical stakeholders
- [X] All mandatory sections completed

## Requirement Completeness

- [X] No [NEEDS CLARIFICATION] markers remain
- [X] Requirements are testable and unambiguous
- [X] Success criteria are measurable
- [X] Success criteria are technology-agnostic (no implementation details)
- [X] All acceptance scenarios are defined
- [X] Edge cases are identified
- [X] Scope is clearly bounded
- [X] Dependencies and assumptions identified

## Feature Readiness

- [X] All functional requirements have clear acceptance criteria
- [X] User scenarios cover primary flows
- [X] Feature meets measurable outcomes defined in Success Criteria
- [X] No implementation details leak into specification

## Notes

- **Updated 2026-06-13** after user follow-up ("we should have the list of all
  badges so the user can see what he can achieve and by what condition, also which
  they have already claimed and when — get inspired by games"). The former optional
  locked-preview (US3) was **promoted to the headline (US1): a full game-style
  badge gallery** — all badges shown, condition for each, claimed-with-date vs
  locked-with-progress-bar, earned-first, "N of M" count. Web-searched Steam/Xbox
  achievement-UI patterns informed it (full set shown, locked dimmed but legible,
  progress bars, earned dates, rarity, unlocked-sorted-to-top). Rarity became the
  new optional US3. Spec/plan/data-model/contracts updated to match.
- Backfill `earned_at` uses a single release-time stamp with the "freshly unlocked"
  pulse suppressed — resolved as an assumption (clear defensible default), not a
  clarification marker. Does not block planning.
- The spec deliberately keeps the *behavioural* architecture decisions (sticky
  insert-only, recognise-at-write-not-read, all-badges-live-derivable) as
  requirements/assumptions because they are observable guarantees, not just
  implementation detail — they change what the user can rely on.
- Ready for `/speckit-plan`.

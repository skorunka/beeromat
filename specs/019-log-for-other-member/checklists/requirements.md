# Specification Quality Checklist: Log a beer on behalf of another member

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-05-26
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

All `[NEEDS CLARIFICATION]` markers resolved by /speckit-clarify
session 2026-05-26:

1. **Affordance location** → Option A (home link + /log catalog).
2. **Confirmation model** → Option C (insert immediately +
   prominent home banner with one-tap "Vrátit").
3. **Reject semantics** → Option α (void + restore stock, nobody
   pays; logger preserved on row for audit).
4. **User follow-up**: /tab row distinction expanded to four
   origin types (self / on-behalf / won-bet / lost-bet), each
   visually distinguishable. FR-007 + FR-007a capture this.

Spec scope expanded slightly during clarify: /tab now needs to
surface `bet_transfers` with `to_member_id = current member`
(the loser's view of bet-linked costs) — today they're invisible
on /tab and only show in the balance total. Implementation will
extend `getMyTabForSession` to emit `transfer_in` entries.

Spec ready for /speckit-plan.

<!--
SYNC IMPACT REPORT
==================
Version change: 1.0.0 → 1.1.0
Bump rationale: MINOR. Multiple principles materially revised and the
Tech Stack section was rewritten with web-verified versions. No principles
removed or fundamentally redefined.

Principles modified:
  II.  Multi-Tenant by Default
       → renamed "Tenant-Aware Schema, Single-Club UX (v1)"
       — schema retains club_id everywhere; multi-club onboarding UI is
         explicitly out of scope for v1.
  V.   Auditable Domain Events
       → renamed "Auditable History (No Hard Deletes)"
       — softened from event-sourced ledger to append-only soft-delete +
         actor/timestamp on every domain row. Cheaper, still answers the
         "who drank what when" pain.

Principles unchanged in spirit but lightly reworded:
  I.   Mobile-First PWA (PWA scope clarified: installable via manifest;
       no service worker / offline support in v1).
  III. Track, Don't Transact
  IV.  Auth That Disappears, Bots That Bounce
  VI.  Free-Tier First, Scale on Demand

Sections modified:
  - Tech Stack & Constraints
      • Auth library: Auth.js v5 → Better Auth (Auth.js maintainers
        themselves now direct new projects to Better Auth as of 2026).
      • PWA tooling: Serwist removed (deferred to a later version).
      • Pinned web-verified versions for every dependency (May 2026).
  - Internationalization & Localization — unchanged.
  - Development Workflow & Quality Gates — unchanged.

Templates reviewed for alignment:
  ✅ .specify/templates/spec-template.md — generic, no changes needed.
  ✅ .specify/templates/plan-template.md — Constitution Check gate is
       principle-agnostic; will pick up revised principles automatically.
  ✅ .specify/templates/tasks-template.md — no principle-specific task
       categories to update.
  ✅ CLAUDE.md — no principle references; no change needed.

Follow-up TODOs:
  - None deferred.
-->

# beeromat Constitution

beeromat is a mobile-first web app that lets a small club (originally a
tennis club after-match crowd) track beer consumption, inter-member bet
transfers, stock, and balances owed to the club treasurer — without ever
processing money itself.

## Core Principles

### I. Mobile-First PWA

The primary surface MUST be a Progressive Web App optimised for one-thumb
operation on a phone in a noisy clubhouse. Desktop browser support is
permitted and expected for operational roles (treasurer reconciliation,
stock management), but no feature for daily members MAY require desktop.
Native iOS/Android packaging is out of scope; app-store distribution
introduces overhead disproportionate to a club-scale product.

For v1, "PWA" means **installable via a Web App Manifest** (home-screen
icon, standalone display) — but NOT a service worker. Offline support
and background sync are deferred to a later version once real usage shows
they are needed; the constitution will be amended at that time.

**Rationale:** Members open the app at the bar with one hand holding a
glass. Anything that needs two hands, a keyboard, or an app-store install
fails the "after match, after one beer" usability bar. Shipping without a
service worker removes a meaningful chunk of v1 complexity (cache
invalidation, sync queues) while still giving the install-to-home-screen
experience users actually ask for.

### II. Tenant-Aware Schema, Single-Club UX (v1)

`Club` is a first-class domain entity in the database from day one. Every
persisted row representing members, beers, stock, sessions, consumptions,
bets, payments, invitations, or configuration MUST carry a `club_id`
foreign key. No global state MAY leak across clubs at the data layer.

However, v1 ships **only single-club UX**: one club is seeded at deploy
time, there is no club-switcher, no public club onboarding, and no
cross-club admin surface. Multi-club onboarding/operations are explicitly
deferred to a later version.

**Rationale:** The user intends to offer beeromat to other clubs
eventually. `club_id` on day one is cheap; retrofitting it to a working
app means touching every query, every API route, every page, and the
auth/session shape — the canonical refactor disaster. By contrast, the
*user-facing* multi-club features add complexity that gives v1 users zero
value. Schema-yes, UI-no is the cheapest correct hedge.

### III. Track, Don't Transact

beeromat MUST NOT initiate, process, or hold money. It computes balances
from logged consumption and bet transfers, displays what each member owes
the treasurer, and exposes a "mark paid" action that records a payment
event. Real money movement happens out-of-band (bank transfer, cash). Any
future payment-rail integration is a v2+ concern requiring a constitution
amendment.

**Rationale:** Payment processing introduces PCI/PSD2 scope, banking
partners, and chargeback exposure incompatible with a free-tier club
tool. The original problem ("we forget who owes what") is solved by
accurate tracking alone.

### IV. Auth That Disappears, Bots That Bounce

Authentication MUST satisfy all of the following:

- **Invitation-only.** No public sign-up flow. New members are invited by
  a `club_admin` or `treasurer` using an email address.
- **Email magic-link is the root of trust.** First sign-in and any new
  device require a magic link sent to the invited email; passwords are not
  used.
- **Device-scoped PIN for daily use.** After magic-link sign-in, the user
  sets a 4-digit PIN that unlocks the app on that device. PINs are stored
  hashed (argon2id or equivalent) and scoped per-device; losing the PIN
  forces a fresh magic link.
- **Brute-force resistance.** Five wrong PIN attempts on a device MUST
  lock that device's session and require magic-link re-auth.
- **Bot resistance.** Cloudflare Turnstile MUST gate the email-entry form,
  and magic-link sends MUST be rate-limited per email and per IP.

**Rationale:** Club members will not tolerate password resets or 2FA
prompts to log a beer. Bots will find any public auth surface within
hours of deployment. The combination above gives near-zero-friction daily
use to invited humans while making automated abuse uneconomic.

### V. Auditable History (No Hard Deletes)

Domain rows representing consumption events, bet transfers, restocks,
stock adjustments, payments, and payment confirmations MUST be
append-only from the user's perspective. Specifically:

- Every such row MUST record `created_at`, `created_by_user_id`,
  `club_id`, and (where applicable) `session_id`.
- Corrections happen by writing a compensating row (e.g., a negative
  consumption or a `voided_at` / `voided_by_user_id` / `void_reason`
  marker), never by `UPDATE`/`DELETE` of historical rows.
- Member balances and stock levels MAY be stored as cached aggregates
  for query performance, but MUST be reconstructible from the underlying
  rows.

**Rationale:** The original pain ("someone sent too much money, we can't
reconstruct why") is fundamentally an audit-trail problem. Mutable rows
let bugs and human errors silently rewrite history. A soft-delete +
compensating-row discipline gives the auditability we need without the
complexity of full event sourcing.

### VI. Free-Tier First, Scale on Demand

v1 MUST run end-to-end on the free tiers of Vercel (hosting), Neon
(Postgres), Resend (transactional email), and Cloudflare (Turnstile +
DNS). Any architectural choice that requires paid infrastructure for a
single 20-member club MUST be justified in the plan's Complexity Tracking
table with a concrete alternative considered and rejected. Scaling beyond
the free tier is a deliberate decision tied to actual multi-club
adoption, not a default.

**Rationale:** Operational cost should be zero until adoption proves
otherwise. The named free tiers comfortably support dozens of clubs at
the expected usage profile.

## Tech Stack & Constraints

The following stack is normative for v1. All versions were verified
against upstream release channels in May 2026. Deviations require a
constitution amendment.

| Concern | Choice | Version | Stability note |
|---|---|---|---|
| Language | TypeScript (strict) | **6.0.x** | TS 7.x is beta (Go-native rewrite); not yet stable. |
| Runtime | Node.js | **24 LTS** | Active LTS. Node 26 becomes LTS in Oct 2026; revisit then. |
| Framework | Next.js (App Router) | **16.x** | v16 is current; v15 reaches end-of-support Oct 2026. |
| UI library | React | **19.2.x** | Required by Next.js 16. |
| ORM | Drizzle ORM | **0.45.x** (stable) | Drizzle v1.0 is still beta (beta.22 in Apr 2026); the 0.45.x line is the production line. |
| Migration tool | Drizzle Kit | **0.31.x** | Pairs with Drizzle ORM 0.45.x. |
| DB driver | `@neondatabase/serverless` | **^1.0** | GA; Neon's official driver, fits serverless functions on Vercel. |
| Database | Neon Postgres | (managed) | Free tier: 0.5 GB, branching included. |
| Auth | **Better Auth** | latest stable v1.x | Replaces Auth.js v5. Auth.js maintainers themselves direct new 2026 projects to Better Auth. Supports magic-link + custom PIN flow we need. |
| Transactional email | Resend | latest SDK | 99.99% uptime YTD 2026; free tier covers our scale. |
| Bot mitigation | Cloudflare Turnstile | (managed) + `@marsidev/react-turnstile` | Free, privacy-friendly, no clicking-buses UX. |
| Styling | Tailwind CSS | **4.3.x** | v4 line has been stable since Jan 2025. |
| Components | shadcn/ui CLI | latest | `new-york` style, `sonner` for toasts (older `toast` deprecated). |
| Hosting | Vercel | (managed) | Free Hobby tier for v1. |
| Observability | Vercel Analytics + structured `console` logs | (managed) | Free tier; revisit if we need traces. |

Linting/formatting MUST use the framework defaults (ESLint flat config,
Prettier). All code MUST pass `tsc --noEmit` and the linter before merge.

Major version upgrades of the items in this table MUST be proposed via a
constitution amendment so the stack stays coherent.

## Internationalization & Localization

- **Currency** MUST be a per-`Club` configuration value (ISO 4217 code);
  CZK is the deployment default but never hardcoded outside seed data.
- **Locale** MUST be a per-user preference defaulting to the club's
  default; v1 ships `cs-CZ` and `en` translation catalogs.
- All user-facing strings MUST flow through an i18n catalog. No literal
  user-facing English in JSX/TSX outside the catalog.
- Date, time, and number formatting MUST use `Intl.*` APIs with the
  user's locale.

## Development Workflow & Quality Gates

- Work flows through the spec-kit pipeline: `/speckit-constitution` →
  `/speckit-specify` → (`/speckit-clarify`) → `/speckit-plan` →
  `/speckit-tasks` → `/speckit-implement`. Skipping stages is permitted
  only for trivial changes (typos, copy edits, dependency bumps).
- Each feature lives on its own branch named per spec-kit conventions
  (`NNN-feature-name`). Commits follow Conventional Commits.
- A feature's `plan.md` MUST pass the Constitution Check gate before
  implementation begins. Any violation MUST be recorded in the
  Complexity Tracking table with a justification, not silently ignored.
- PRs MUST link to their spec and plan, include a test plan, and pass
  type-check + lint in CI.

## Governance

This constitution supersedes all other practices in the beeromat project.
When a tension arises between this document and any other doc, this
document wins until amended.

**Amendment procedure:** Propose the change in a PR that edits this file,
includes a Sync Impact Report (as the HTML comment at the top), and
updates any dependent templates flagged in that report. Approval requires
a review acknowledging the version-bump rationale.

**Versioning policy** (semantic):

- **MAJOR**: Removing or fundamentally redefining a principle.
- **MINOR**: Adding a principle or materially expanding/revising
  guidance, including stack-level dependency swaps.
- **PATCH**: Clarifications, wording fixes, non-semantic refinements.

**Compliance review:** Every `/speckit-plan` invocation re-evaluates the
Constitution Check gate; principle violations must be justified or fixed,
not waived informally.

**Version**: 1.1.0 | **Ratified**: 2026-05-19 | **Last Amended**: 2026-05-19

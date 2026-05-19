# Phase 0 Research: Beer Consumption Ledger (v1 MVP)

**Feature**: `001-beer-consumption-ledger` | **Date**: 2026-05-19

This document resolves every NEEDS CLARIFICATION item from the plan's Technical Context. Each entry is a decision with its rationale and the alternatives considered. Every choice was web-verified against May 2026 release channels.

---

## 1. Authentication library

**Decision**: **Better Auth v1.x** with the official `magic-link` plugin.

**Rationale**:
- The Auth.js (NextAuth) maintainers themselves now point new 2026 projects to Better Auth — Auth.js development has rolled into the Better Auth team.
- Better Auth v1 shipped in early 2025 and is the only auth library here actively gaining features in 2026.
- The `magic-link` plugin is officially documented, gives us `expiresIn` (default 300s, matches our 5-min expiry requirement), `disableSignUp: true` (matches our invitation-only requirement), `generateToken` for custom token policy, and `sendMagicLink` callback for Resend integration.
- Recent activity (v1.6.11 in May 2026 fixed a race condition in the magic-link plugin) shows active maintenance.

**Alternatives considered**:
- **Auth.js v5**: In maintenance mode; maintainers explicitly recommend Better Auth for new projects.
- **Roll our own session/token machinery**: ~150 LOC, total control, but reinventing the wheel for invariants Better Auth already gets right (CSRF, secure cookies, single-use tokens).
- **Clerk**: Hosted; would violate "Free-Tier First" at scale; pricing changes can hurt; less control.

---

## 2. Device-PIN integration with Better Auth

**Decision**: **Custom PIN service layered on top of Better Auth's session**, not a Better Auth plugin.

**Rationale**:
- Better Auth has no built-in plugin for "device-scoped PIN unlock"; its magic-link plugin handles initial sign-in but not the daily-unlock UX.
- The two concerns are cleanly separable: Better Auth answers "is this user authenticated against the server?"; our PIN service answers "is this user's session unlocked on this device right now?"
- Implementation:
  - A `device_sessions` table keyed by `(user_id, device_id)` stores the argon2id PIN hash, `failed_attempts`, `locked_until`, `last_unlock_at`, and a human label.
  - `device_id` is a cryptographically-random opaque value stored in a long-lived `device_id` HttpOnly cookie set on first magic-link sign-in.
  - On every protected route, a middleware checks (a) Better Auth session present AND (b) device session unlocked within a configurable timeout (default: lock after 8h of inactivity, prompt for PIN again).
  - PIN failure on a device increments `failed_attempts`; at 5, `locked_until` set to far-future; the device's Better Auth session is invalidated, forcing a fresh magic link.
- Server actions for PIN: `setPin`, `verifyPin`, `clearPin` (for forgot-PIN; requires fresh magic link).

**Alternatives considered**:
- **Custom Better Auth plugin**: Possible but tightly couples PIN to Better Auth's lifecycle hooks; harder to test in isolation; harder to swap out auth library later.
- **Storing PIN in browser-side keystore (WebAuthn / passkey)**: Out of scope for v1 — adds complexity (device enrollment UX, fallback flow) without solving the original pain. Could be a v2 enhancement.

---

## 3. Internationalization library

**Decision**: **`next-intl ^3.x`** with locale-segment routing under `app/[locale]/…`.

**Rationale**:
- next-intl is the most widely adopted i18n library for Next.js App Router in 2026 (per the LogRocket / Medium reviews, the i18n guides from i18nexus and intlpull).
- Native Server Component support — translations render server-side and contribute zero bytes to the client bundle.
- ICU message syntax (pluralization, gender, formatting) — necessary for Czech grammar.
- Built-in routing middleware for locale detection and redirects.
- Active maintenance and full Next.js 16 support.
- `setRequestLocale(locale)` + `generateStaticParams` for SSG of locale-specific routes.

**Alternatives considered**:
- **next-i18next**: Works on App Router as of v16 but architecturally feels grafted-on; bundle size larger.
- **lingui / Format.js**: Powerful but heavier; not Next.js-native.
- **Custom JSON-loader + Intl.\* APIs**: Cheap to start, hard to maintain at >2 locales or with pluralization.

---

## 4. PWA installability

**Decision**: **`app/manifest.ts` (Next.js 16 native)**, no service worker in v1.

**Rationale**:
- Next.js 16 has first-class `MetadataRoute.Manifest` support — define `name`, `short_name`, `description`, `start_url`, `display: "standalone"`, `theme_color`, `background_color`, and `icons[]` in a typed manifest file.
- A manifest alone delivers the "Add to Home Screen" + standalone-display experience users actually ask for, on both iOS Safari 16+ and Android Chrome 110+.
- A service worker (for offline writes + background sync) materially raises complexity (cache invalidation, sync queues, conflict resolution) and is explicitly deferred per constitution Principle I.

**Alternatives considered**:
- **Serwist**: The maintained successor to `next-pwa`; gives us service-worker tooling. Skipped for v1 by constitutional principle; revisit when offline-write becomes a real complaint.
- **Static `public/manifest.json`**: Works but loses TypeScript typing and the ability to dynamically branch on club configuration if we ever want per-club theme colors.

---

## 5. Testing strategy

**Decision**:
- **Unit/integration**: Vitest + React Testing Library; PGlite (in-memory Postgres) for DB-touching tests
- **E2E**: Playwright (Chromium + WebKit projects)
- Async Server Components are tested **only** in Playwright (Vitest current limitation)

**Rationale**:
- Vitest is the de facto unit-test tool for Next.js 16 in 2026 (per the Next.js docs and 2026 testing guides). Fast, watch-mode, ESM-native, no Jest config archaeology.
- React Testing Library for synchronous Server/Client component rendering.
- PGlite (in-process Postgres in Node) gives each test its own DB clone in milliseconds — perfect for Drizzle integration tests of the balance calculator, void semantics, etc.
- Playwright handles what Vitest can't: async Server Components, auth-flow integration, cookie/middleware behavior, WebKit (iOS Safari rendering).
- Splitting unit/integration/E2E into separate test directories keeps run-time predictable: `vitest run tests/unit tests/integration` is fast; Playwright runs only on CI and pre-deploy.

**Alternatives considered**:
- **Jest**: Slower, more config, less ESM-friendly; the 2026 Next.js community has largely moved to Vitest.
- **Playwright only (no Vitest)**: Possible but punishingly slow for pure-logic tests (balance arithmetic, SPAYD string assembly).
- **Test against a real Neon branch DB**: Reasonable for CI but adds network latency to every test run; PGlite is faster and equivalent for Drizzle's SQL dialect.

---

## 6. PIN hashing algorithm

**Decision**: **`argon2` npm package (`argon2.argon2id` variant)**, target 100–300 ms per hash on Vercel's Node 24 runtime.

**Rationale**:
- OWASP, NIST, and IETF (RFC 9106) recommend Argon2id over bcrypt/scrypt for new password/PIN systems in 2026.
- The `argon2` npm package (`ranisalt/node-argon2`) is mature, tested against Node 22+, ships native bindings to the reference Argon2 implementation, and is widely used in production.
- Output format is the standard PHC string (`$argon2id$v=19$m=...,t=...,p=...$salt$hash`) — the salt and parameters are encoded in the hash itself, so we only store a single string.
- A 4-digit PIN has only 10,000 combinations — the brute-force cost has to come from (a) per-attempt argon2 cost and (b) the 5-strike lockout. Tuning argon2 to 150–250 ms per hash makes online brute-force prohibitively slow even without the lockout.

**Alternatives considered**:
- **`@node-rs/argon2`**: Pure-Rust binding, fast install (no compile step), Node-API-native. Reasonable alternative if `argon2` install issues appear on Vercel; functionally equivalent.
- **bcrypt**: Older, well-understood, but OWASP now considers Argon2id strictly stronger.
- **scrypt** (Node built-in `crypto.scrypt`): Workable but parameter selection is less guided; less common in current best-practice docs.

---

## 7. Czech QR Platba payload format

**Decision**: **SPAYD/SPD v1.0** (Short Payment Descriptor, per qr-platba.cz).

**Format**:
```
SPD*1.0*ACC:<IBAN>*AM:<amount>*CC:<currency>*X-VS:<variable_symbol>*MSG:<message>
```

**Rules**:
- Header: `SPD*1.0*` (mandatory).
- Key-value pairs separated by `*`; key and value separated by `:`.
- `ACC` (mandatory): the club's IBAN (e.g., `CZ7603000000000076327632`).
- `AM` (mandatory): the exact amount with a decimal point (`200.00`), NOT a comma.
- `CC` (currency code, ISO 4217): defaults to `CZK` for our use case.
- `X-VS` (variable symbol): the payment intent's unique reference, up to 10 digits.
- `MSG` (optional): a human-readable message; we'll use `"beeromat <member-name>"` so the recipient sees what the payment is for. ASCII only — no Czech diacritics in MSG per spec safety (the Czech bank network historically didn't transport non-ASCII reliably in this field).
- Value fields MUST NOT contain `*`; if they do, the spec defines an encoding but our generated content never includes asterisks.

**Implementation approach**:
- `lib/qr-platba/spayd.ts`: pure function `buildSpaydString({ iban, amount, currency, variableSymbol, message }) → string`. Easy to unit-test.
- `lib/qr-platba/render.ts`: takes the SPAYD string and produces an SVG QR code via the `qrcode` npm package. SVG (not PNG) because (a) scales crisply on Retina displays and (b) is smaller for the typical-size QR.
- Variable symbol: server-generated, ≤ 10 digits, monotonic per club. Stored on the Payment row.

**Universal Czech-bank support**: All major Czech banking apps (Česká spořitelna, ČSOB, Komerční banka, Raiffeisenbank, Air Bank, Fio, mBank) parse SPAYD via the same standard.

**Alternatives considered**:
- **EPC QR (European Payments Council)**: Used elsewhere in the EU; Czech banks do not universally support it.
- **Custom payment links per bank**: A maintenance nightmare; SPAYD is the universal standard.

---

## 8. Drizzle migrations workflow

**Decision**:
- **Local dev**: `drizzle-kit push` for fast iteration on the schema while features are in flux.
- **Production / shared branches**: `drizzle-kit generate` to emit versioned SQL migration files committed to `drizzle/`, then `drizzle-kit migrate` (or app-side migrate-on-start) to apply.
- Use **Neon database branching** (free tier supports it) for preview/PR environments: each PR gets its own DB branch; CI applies migrations to a clean branch.

**Rationale**:
- `push` is great for solo schema exploration but unsafe in shared environments (no rollback, no audit). Versioned SQL files are the correct production discipline.
- Neon's free-tier branching is a killer feature here — each preview deploy on Vercel gets a clean Postgres branch in seconds, no extra cost.

**Alternatives considered**:
- **App-side auto-migrate on boot**: Considered for simplicity; rejected because it tightly couples deploy timing to migration timing and makes destructive migrations risky.
- **Manual SQL migrations**: Loses Drizzle's type-safe schema source-of-truth.

---

## 9. Server Action vs route handler vs RPC

**Decision**: **Server Actions** for mutations, **Server Components** for reads, **route handlers** reserved for the Better Auth handler mount (`/api/auth/[...all]`) and any future webhooks.

**Rationale**:
- Server Actions are the App Router-native way to mutate from a Client Component without a separate API layer; they get CSRF protection, type safety, progressive enhancement (work without JS for simple forms), and built-in error boundaries.
- Server Components are the App Router-native way to read; we get streaming, suspense, and zero client JS for static read views.
- Skipping a separate REST/tRPC API layer simplifies the project structure dramatically — no API client, no codegen step, no API versioning concerns for v1.
- Better Auth needs a route handler at `/api/auth/[...all]/route.ts` because the magic-link callback comes in as a GET request from an external email — that's the one mandatory route handler.

**Alternatives considered**:
- **tRPC**: Adds a layer; valuable for cross-app type sharing but we have no client outside this Next.js app.
- **REST API + fetch from React**: Pre-App-Router pattern; redundant overhead in 2026.

---

## 10. Rate limiting for magic-link sends

**Decision**: **Upstash Redis Free** with `@upstash/ratelimit` package for per-email and per-IP magic-link rate limits.

**Rationale**:
- Vercel doesn't have built-in persistent rate limiting; we need a key-value store with TTL.
- Upstash Free tier: 10k commands/day; one magic-link request is 2 commands (one per-email, one per-IP) → comfortably covers 20 members × many attempts.
- `@upstash/ratelimit` provides the sliding-window algorithm out of the box.
- Falls within "Free-Tier First, Scale on Demand."

**Alternatives considered**:
- **Vercel KV** (now Upstash-backed anyway): Functionally equivalent; pricing slightly less generous on free.
- **Postgres-based rate limiting**: Possible (Neon row-locking) but heavier per-request; better reserved for transactional state.
- **No rate limit, rely on Turnstile alone**: Turnstile already mitigates most automation, but layered defense is wise for an auth endpoint that triggers external email sends (cost to us).

---

## 11. Cloudflare Turnstile integration

**Decision**: Wrap the email-entry form's submit in a Server Action that, before invoking Better Auth's magic-link send, POSTs to `https://challenges.cloudflare.com/turnstile/v0/siteverify` with the secret key and the token from the form. On failure, return a generic "could not send link" message to avoid information disclosure.

**Rationale**:
- The token from `@marsidev/react-turnstile` (the maintained React wrapper) is delivered as a hidden form field via the Turnstile widget's `onSuccess` callback.
- Server Actions receive form data as `FormData` natively; extracting the `cf-turnstile-response` field is straightforward.
- Tokens are valid for 5 minutes; sufficient for the magic-link request flow.
- Failure modes (token missing, invalid, expired, replay) all return the same generic UI message — never expose Turnstile-specific errors to the client.

**Alternatives considered**:
- **hCaptcha**: Comparable, but Cloudflare Turnstile has better DX for invisible-mode and is fully free with no usage limits.
- **No CAPTCHA, rely on rate limits only**: Riskier — bots can still drain Resend's quota or trigger email-reputation damage even with rate limits, because each unique fake email gets through the per-email limit on first try.

---

## 12. Currency formatting

**Decision**: Use **`Intl.NumberFormat`** with the user's locale + the club's currency code; store amounts as **integer minor units** (`smallest_unit_int`, e.g. CZK halléř = 1/100 CZK).

**Rationale**:
- Floating-point is unsafe for money; integer minor units is the universal best practice.
- `Intl.NumberFormat` natively handles localized formatting (`1 234,50 Kč` for `cs-CZ`, `CZK 1,234.50` for `en-US`).
- Currency code is per-club configuration (FR-037, FR-041); the same code drives both QR Platba's `CC:` field and the display formatter.
- For QR Platba, the `AM:` field needs decimal-point notation (`200.00`, not `200,00`); convert from integer minor units at QR-generation time.

**Alternatives considered**:
- **Store as decimal**: Postgres `numeric` would work, but JS-side arithmetic with `bigint` integer math is faster and never surprises with rounding errors.
- **Library like `dinero.js`**: Overkill for v1 with a single currency per club.

---

## Summary

| Area | Decision |
|---|---|
| Framework | Next.js 16.2 App Router + React 19.2 + TypeScript 6 |
| Runtime | Node.js 24 LTS |
| DB | Neon Postgres + `@neondatabase/serverless` + Drizzle 0.45 |
| Auth | Better Auth v1.x + magic-link plugin + custom device-PIN service |
| PIN hashing | `argon2` (argon2id), 150–250 ms target |
| Email | Resend SDK + react-email templates |
| Bot mitigation | Cloudflare Turnstile (`@marsidev/react-turnstile`) + Upstash rate-limit |
| i18n | `next-intl` v3 with `[locale]` segment |
| PWA | `app/manifest.ts` only (no SW in v1) |
| QR | SPAYD/SPD v1.0 via `qrcode` SVG renderer |
| Testing | Vitest + RTL + PGlite (unit/integration) + Playwright (E2E) |
| Migrations | `drizzle-kit generate` for prod; `push` for local dev; Neon branching for preview |
| Mutations | Server Actions (not REST/tRPC) |
| Money | Integer minor units; `Intl.NumberFormat` for display; decimal-point in SPAYD `AM:` |

All Phase 0 unknowns are resolved. Proceeding to Phase 1 (data model + contracts + quickstart).

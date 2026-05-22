# Quickstart: Forms & Input Hardening (v1.2)

How to build, run, and verify v1.2. The dev/test infrastructure is unchanged
from v1 / v1.1 — see `specs/002-ux-hardening/quickstart.md` for the Docker
stack (Postgres 5433, neon-proxy 14444/14445, Mailpit 11025/18025).

## Setup

```powershell
docker compose up -d            # Postgres, neon proxies, Mailpit — unchanged
pnpm install                    # picks up react-hook-form + @hookform/resolvers
pnpm dev                        # http://localhost:3000
```

v1.2 adds two runtime dependencies — `react-hook-form` and
`@hookform/resolvers` (Zod 4 resolver). `zod` is already installed. No new
containers, no migrations, no env vars.

## Verification gates

v1.2 is "done" when all gates pass — the six existing gates plus the new
`forms:check`:

```powershell
pnpm typecheck                  # tsc --noEmit
pnpm lint                       # ESLint flat config
pnpm test                       # Vitest (unit/integration, PGlite)
pnpm i18n:check                 # catalog parity + every t() key resolves (incl. forms.*)
pnpm forms:check                # NEW — no native date/time inputs, no required/pattern
pnpm build                      # production build
pnpm exec playwright test       # E2E against the production build
```

## What `forms:check` does

`scripts/forms-check.ts` scans `app/` and `components/` and fails the build if
any form reintroduces browser-native input handling:

- a native date/time input (`type="date" | "time" | "datetime-local"`)
- the `required` attribute on a control
- the `pattern` attribute on a control

It passes on the v1.2 end state (zero violations). To see it bite, add
`required` to any input and re-run — it exits non-zero with the file:line.

## Manually verifying the hardening

With `pnpm dev` running, for each form group:

**Auth & onboarding (US1)** — open `/sign-in`, submit an address with no `@`:
an in-app message appears beside the email field, **no browser popup**. On the
PIN setup screen, enter a 3-digit PIN → in-app message; enter mismatched PINs →
a clear cross-field message. Switch language with a message showing → the
message text changes language.

**Money (US2)** — on the settle "paid another way" form and the treasurer
manual-payment form, type letters into the amount → in-app message, the
Server Action does not fire. Enter a valid amount + note → records exactly as
in v1.

**Admin (US3)** — on member invite, banking, and the beer-type / restock /
adjust forms, submit a malformed email / IBAN / non-integer quantity / empty
reason → in-app message beside the field, other fields keep their values.

In every case: **no browser validation bubble**, the message is in the app's
language, and it sits next to the field.

## What did NOT change

- No database tables, columns, or migrations.
- No Server Action signature or return type (FR-014) — actions swap an inline
  schema for a shared import; behaviour is identical.
- No balance, payment, stock, or bet logic.
- Cloudflare Turnstile on sign-in and the PIN attempt-limit / lockout.
- No date-picker component (User Story 4 — guardrail only; the picker is a
  future feature's first task).

## Definition of done

- All seven gates above pass.
- Every form in the 11-form inventory (spec.md → "Forms In Scope") renders
  validation in-app, localized, with no native bubble.
- Every acceptance scenario in spec.md has a passing E2E assertion (SC-007).
- `forms:check` is wired into the gate set and CI.

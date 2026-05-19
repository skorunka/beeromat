# Quickstart: beeromat v1 dev environment

**Feature**: `001-beer-consumption-ledger` | **Date**: 2026-05-19

Get from a fresh clone to "log my first beer in dev" in ~15 minutes. This guide assumes Windows or macOS / Linux with PowerShell or Bash available.

---

## Prerequisites

| Tool | Version | Verify |
|---|---|---|
| Node.js | **24 LTS** | `node --version` should print `v24.x.x` |
| pnpm (recommended) or npm | latest | `pnpm --version` |
| Git | any modern | `git --version` |
| A free **Neon** account | — | https://neon.tech — sign up, no card required |
| A free **Resend** account | — | https://resend.com — for sending magic-link emails |
| A free **Cloudflare** account | — | https://dash.cloudflare.com — for Turnstile |
| A free **Upstash** account | — | https://upstash.com — for Redis (rate limiting) |

You do **not** need a Vercel account for local dev; you'll need one for first deploy (Phase 3+).

---

## 1. Clone and install

```powershell
git clone https://github.com/<owner>/beeromat.git
cd beeromat
pnpm install
```

If you don't have pnpm: `npm install -g pnpm` (or use `npm` everywhere — pnpm is faster but not required).

---

## 2. Create your Neon database

1. Log in to Neon → "Create new project."
2. Project name: `beeromat-dev`. Region: closest to you (EU-West works for CZ).
3. Postgres version: latest (16+).
4. Once created, copy the **connection string** (looks like `postgres://...neon.tech/.../neondb?sslmode=require`).
5. (Optional but recommended) Create a development **branch** — `main` for the canonical schema, `dev` for your local work. Neon's free tier supports branching.

---

## 3. Set up service credentials

### Resend (transactional email)

1. Sign up at resend.com.
2. Settings → API Keys → "Create API Key" with `Sending access`.
3. Copy the key (starts with `re_`). You'll paste it as `RESEND_API_KEY`.
4. For local dev you can send to the special `delivered@resend.dev` address; for testing with real inboxes, you'll need to verify a domain. (Optional for first run.)

### Cloudflare Turnstile

1. Dashboard → Turnstile → "Add Site."
2. Domain: `localhost` (Turnstile accepts this for dev).
3. Widget mode: **Managed** (recommended; invisible when possible, challenge when needed).
4. Copy the **Site Key** (public) and **Secret Key** (server-side).

### Upstash Redis (rate limiting)

1. Dashboard → "Create database" → name `beeromat-rl-dev`. Region: any.
2. After provisioning, copy the **REST URL** and **REST Token**.

---

## 4. Configure environment variables

Copy the template and fill it in:

```powershell
Copy-Item .env.example .env.local
```

Edit `.env.local`:

```bash
# Database
DATABASE_URL="postgres://...neon.tech/.../neondb?sslmode=require"

# Better Auth
BETTER_AUTH_SECRET="<generate with: openssl rand -base64 32>"
BETTER_AUTH_URL="http://localhost:3000"

# Email (Resend)
RESEND_API_KEY="re_..."
EMAIL_FROM="beeromat <onboarding@resend.dev>"   # or your verified domain

# Bot mitigation (Cloudflare Turnstile)
NEXT_PUBLIC_TURNSTILE_SITE_KEY="0x4AAA..."
TURNSTILE_SECRET_KEY="0x4AAA..."

# Rate limiting (Upstash)
UPSTASH_REDIS_REST_URL="https://...upstash.io"
UPSTASH_REDIS_REST_TOKEN="..."

# Seed admin (used only on first migration's seed step)
SEED_ADMIN_EMAIL="you@example.com"
SEED_ADMIN_NAME="Your Name"
SEED_CLUB_NAME="TK Slávia Praha"
SEED_CLUB_CURRENCY="CZK"
SEED_CLUB_LOCALE="cs-CZ"
```

**Important — what is NOT in `.env`**: the club's IBAN, Revolut handle, beer-type catalog, low-stock thresholds, member list, and roles. Per the constitution (Principle II, v1.1.1) these are administered in the in-app admin UI. `.env` only holds deployment-scoped concerns and the bootstrap seed values.

---

## 5. Apply database migrations

```powershell
pnpm db:migrate
```

What this runs:

- `drizzle-kit migrate` against `DATABASE_URL` to apply versioned SQL files in `drizzle/`.
- A separate `pnpm db:seed` step (or auto-invoked at the end) creates:
  - One `clubs` row from the `SEED_CLUB_*` env vars.
  - One `members` row with role `club_admin` for the email in `SEED_ADMIN_EMAIL`. The Better Auth user is created lazily on first magic-link sign-in.

Verify with the Drizzle Studio:

```powershell
pnpm db:studio
```

Opens at `https://local.drizzle.studio` with a live read of your Neon dev branch.

---

## 6. Start the dev server

```powershell
pnpm dev
```

Open `http://localhost:3000` — you'll land on the locale-prefixed home (`/cs` or `/en` depending on browser preference).

---

## 7. Walk through User Story 1 — log a first beer

1. **Sign in** — click "Sign in" → enter `SEED_ADMIN_EMAIL` → complete Turnstile → check your inbox (or the Resend dashboard if using a sandbox sender) → click the magic link.
2. **First-device setup** — the app prompts you to set a display name (pre-filled from seed) and a 4-digit PIN. Set both. You land on the home screen.
3. **Configure a beer type** — top-right menu → Admin → Beer types → "Add beer type." Name: `Pilsner Urquell 0.5l`, price `52.00`, initial stock `100`, low-stock threshold `5`. Save.
4. **Log a beer** — back to home → tap the big "Log a beer" button → tap your new beer type → confirm. Your tab updates to `52.00 Kč`.
5. **Verify in Drizzle Studio** — refresh `consumptions` table: one row with your `member_id`, the beer type, price snapshot `5200` (minor units), session auto-opened.

You've validated the P1 happy path.

---

## 8. Walk through User Story 2 — settle your tab (member self-pay)

1. **Configure the club banking profile** — Admin → Club settings → Banking → enter a test IBAN (e.g., `CZ7603000000000076327632` is the qr-platba.cz example IBAN; do NOT use a real one in dev). Save.
2. **Open Settle** — main menu → "Pay my tab" → see your balance (52.00 Kč) and a generated QR code.
3. **Inspect the QR** — scan with a Czech banking app on your phone, or decode at https://qr-platba.cz/pro-vyvojare/validator/. The SPAYD payload should be:
   ```
   SPD*1.0*ACC:CZ7603000000000076327632*AM:52.00*CC:CZK*X-VS:1*MSG:beeromat <your name>
   ```
4. **Mark "I paid"** — tap the button. Status: `claimed`. Balance now shows "0.00 Kč (pending confirmation 52.00 Kč)."
5. **Switch hats — confirm as treasurer** — Admin → Treasurer → Pending confirmations → see the claim → tap "Confirm received." Balance finalises to 0.00 Kč.

P1 settle loop validated.

---

## 9. Run the test suite

```powershell
pnpm test:unit              # Vitest unit & integration (PGlite)
pnpm test:e2e               # Playwright E2E (needs dev server running OR uses webServer in playwright.config)
pnpm test                   # both, in CI order
```

PGlite spins up an in-process Postgres for every test file; no Neon connection used during tests.

---

## 10. Useful scripts

```powershell
pnpm lint                   # ESLint flat config
pnpm typecheck              # tsc --noEmit
pnpm db:generate            # generate a new migration after schema edits
pnpm db:push                # push schema directly (LOCAL DEV ONLY, never on shared branches)
pnpm db:studio              # Drizzle Studio
pnpm i18n:check             # verify cs + en catalogs are in sync (missing keys warning)
```

---

## 11. Common gotchas

- **Magic-link email not arriving** in dev: check Resend's dashboard "Emails" tab. If using `onboarding@resend.dev`, your inbox provider may junk it — `delivered@resend.dev` is a sink that accepts all.
- **Turnstile fails on `localhost`**: ensure the Turnstile site is configured with `localhost` in its allowed domains (not just `127.0.0.1`).
- **`drizzle-kit migrate` fails with "relation already exists"**: you ran `db:push` previously then tried `migrate` — start with a clean Neon branch and re-run `migrate` only.
- **PIN unlock loops** after dev-server restart: clearing the `device_id` cookie in browser devtools and re-signing-in forces a fresh device session.
- **PWA install prompt missing** on desktop Chrome: PWA installability requires HTTPS or `localhost`; check `chrome://flags` if you've disabled PWA features.

---

## 12. Next steps (post-quickstart)

Once you can complete the P1 walkthroughs above, run:

```
/speckit-tasks
```

…which produces `tasks.md` with the granular implementation tasks ordered by user-story priority (P1 first), each tied to acceptance scenarios from the spec.

After that, `/speckit-implement` (or working through `tasks.md` manually) drives the actual code into existence.

# Quickstart: Visual Redesign & Design System (v1.4)

How to build, run, and verify v1.4. Dev/test infrastructure is
unchanged from v1–v1.3 — see `specs/002-ux-hardening/quickstart.md` for
the Docker stack.

## Setup

```powershell
docker compose up -d            # Postgres, neon proxies, Mailpit — unchanged
pnpm install                    # no new dependencies in v1.4
pnpm dev                        # http://localhost:3000
```

v1.4 adds **no dependencies** (the display typeface loads through
`next/font`, built into Next), **no env vars**, **no migrations**.

## Verification gates

v1.4 is "done" when all seven gates pass:

```powershell
pnpm typecheck
pnpm lint
pnpm test                       # Vitest unit/integration
pnpm i18n:check                 # catalog parity (incl. welcome-screen copy)
pnpm forms:check                # restyled forms add no native validation
pnpm build
pnpm exec playwright test       # E2E — regression + ux3-redesign.spec.ts
```

E2E note: on this machine, run Playwright against a hand-started server
(`reuseExistingServer` is on locally) and in batches if needed — see
`specs/004-ux-backlog-completion` notes. Behaviour is unchanged by v1.4,
so the v1–v1.3 specs are the regression net.

## Manually verifying the redesign

With `pnpm dev` running, on a phone-width viewport (360–390 px):

- **Identity (US1)** — every screen is the warm Clubhouse look (foam
  cream ground, honey-amber accents, Bricolage Grotesque type); no
  screen still shows the old flat-grey unstyled default.
- **Dark mode (US1)** — set the OS / browser to dark: the app renders
  the dark Clubhouse theme (deep roast-brown) with no flash on load;
  switch back and it re-themes cleanly.
- **Components (US2)** — buttons, inputs, cards, badges, dialogs, the
  bottom nav and toasts share one consistent style; focus and pressed
  states are visible; every control is ≥44 px.
- **Layouts (US3)** — home, log, tab, settle, bet, account, history
  each have one clear focal point and a comfortable phone layout; no
  clipping or horizontal scroll at 360 px.
- **Welcome (US4)** — signed out, the entry is a branded welcome hero
  that leads into the magic-link sign-in.
- **Admin (US5)** — the admin screens look of a piece with the rest.
- **Legibility** — body text is ≥16 px and high-contrast in both
  themes; readable at arm's length with reading glasses.

## What did NOT change

- No database tables, columns, or migrations.
- No Server Action signature, return type, or behaviour (FR-010) —
  every v1–v1.3 flow works exactly as before.
- No balance, payment, stock, or bet logic.
- No new dependency or infrastructure.
- The `/design` scratch preview page is removed.

## Definition of done

- All seven gates pass.
- The full v1–v1.3 E2E suite passes unchanged in behaviour (SC-005).
- `ux3-redesign.spec.ts` asserts theme-applied, AA contrast (light +
  dark), ≥44 px targets, 360×640 layout, and the welcome screen — all
  green (SC-008).
- No screen retains the pre-redesign unstyled-default look (SC-001).

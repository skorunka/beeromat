# Data Model: Visual Redesign & Design System (v1.4)

## Database & domain entities — NO CHANGE

v1.4 adds **no tables, no columns, no migrations, no domain entities**.
The v1 data model and every Server Action contract are unchanged
(FR-010). This feature is presentation only.

The "model" v1.4 introduces is the **design-token model** — the
canonical set of theme tokens, the type scale, and the radius/elevation
scale. It is design data, not persisted data; it is documented here
because `/speckit-tasks` and `/speckit-implement` build against it.

## Design tokens — the Clubhouse theme

The full shadcn semantic vocabulary, defined once in `app/globals.css`.
Light values are the starting point; **every text-bearing pair is
verified against a WCAG-AA contrast checker during implementation**
(FR-004 is the gate — research.md Decision 4).

### Light theme

| Token | Role | Value |
|-------|------|-------|
| `--background` | page background | `#F6EEDD` Foam Cream |
| `--foreground` | body text | `#2C2114` Stout Ink |
| `--card` / `--popover` | raised surfaces | `#FFFBF3` Pour White |
| `--card-foreground` / `--popover-foreground` | text on surfaces | `#2C2114` |
| `--primary` | primary button fill | `#8A5214` deep honey *(deepened for AA)* |
| `--primary-foreground` | text on primary | `#FFFBF3` |
| `--secondary` | secondary button / badge | `#EAD9B8` warm sand |
| `--secondary-foreground` | text on secondary | `#2C2114` |
| `--muted` | muted surface | `#EFE6D2` |
| `--muted-foreground` | secondary / hint text | `#6E5E48` *(darkened from Malt Grey for AA)* |
| `--accent` | hover / subtle fill | `#EFE2C8` pale amber |
| `--accent-foreground` | text on accent | `#2C2114` |
| `--destructive` | error / danger | `#B23B2E` warm brick |
| `--destructive-foreground` | text on destructive | `#FFFBF3` |
| `--border` / `--input` | borders, dividers, field outlines | `#E4D7BE` |
| `--ring` | focus ring | `#B5701A` Honey Amber *(the brand accent)* |
| `--brand` | hero / heading / active-nav accent | `#B5701A` Honey Amber |

### Dark theme — `@media (prefers-color-scheme: dark)`

| Token | Role | Value |
|-------|------|-------|
| `--background` | page background | `#221A11` deep roast |
| `--foreground` | body text | `#F1E7D2` warm cream |
| `--card` / `--popover` | raised surfaces | `#2E2417` |
| `--card-foreground` / `--popover-foreground` | text on surfaces | `#F1E7D2` |
| `--primary` | primary button fill | `#D98E2E` bright honey |
| `--primary-foreground` | text on primary | `#221A11` |
| `--secondary` | secondary button / badge | `#3A2E1C` |
| `--secondary-foreground` | text on secondary | `#F1E7D2` |
| `--muted` | muted surface | `#2E2417` |
| `--muted-foreground` | secondary / hint text | `#B3A484` |
| `--accent` | hover / subtle fill | `#3A2E1C` |
| `--accent-foreground` | text on accent | `#F1E7D2` |
| `--destructive` | error / danger | `#E0685A` |
| `--destructive-foreground` | text on destructive | `#221A11` |
| `--border` / `--input` | borders, dividers, field outlines | `#3E3120` |
| `--ring` | focus ring | `#D98E2E` |
| `--brand` | hero / heading / active-nav accent | `#D98E2E` |

## Typography scale

One family — **Bricolage Grotesque** (`next/font/google`, `swap`,
system-stack fallback), exposed as `--font-sans`.

| Step | Use | Size / weight (starting point) |
|------|-----|--------------------------------|
| Display | hero / screen title | ~28–34 px, extrabold |
| Heading | section heading | ~20–22 px, bold |
| Body | default text | ~16 px, regular — never below 16 px (legibility) |
| Label | field labels, nav | ~14 px, medium |
| Caption | hints, metadata | ~12–13 px, regular |

Sizes are generous on purpose — Standa and Jiří read with glasses on a
small screen (FR-003). Body text never goes below 16 px.

## Radius & elevation

| Token | Value | Use |
|-------|-------|-----|
| `--radius` | `0.875rem` (~14 px) | the base corner radius; cards, dialogs, larger surfaces |
| derived `--radius-sm` | `calc(--radius - 4px)` | inputs, badges, small controls |
| elevation | one soft warm shadow for raised surfaces; flat for inline elements | cards, dialogs, the bottom nav |

## UI state (no persistence)

| Surface | State | Owner |
|---------|-------|-------|
| Theme (light/dark) | derived from the OS `prefers-color-scheme` | the browser; pure CSS, no app state, no storage |
| Everything else | unchanged from v1–v1.3 | — |

No persisted state changes anywhere in v1.4.

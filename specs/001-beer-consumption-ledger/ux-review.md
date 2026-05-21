# beeromat v1 — UX & Product Review

**Feature**: `001-beer-consumption-ledger` | **Phase**: post-implementation review
**Date**: 2026-05-21 | **Method**: persona-driven heuristic walkthrough + reviewer panel

All eight user stories (US1–US8) are implemented and pass their verification
gates (typecheck, lint, unit, build, Playwright E2E). This document reviews the
*built product* from the user's side of the glass: who uses it, how the real
screens hold up under realistic habits, what should change, and what the review
teaches us about the spec-driven process itself.

It is deliberately critical. A green test suite proves the code does what the
spec said; it does not prove the spec asked for the right thing, nor that the
result feels good in a noisy clubhouse on a cracked phone screen.

---

## 1. Method

- **Personas**: five members of a fictional ~20-person Czech amateur tennis
  club, spanning age, role, device, and tech comfort.
- **Exploratory sessions**: each persona is walked through the flows they would
  actually touch, on the *real* implemented screens, looking for friction,
  confusion, and dead ends — not for bugs (those are the E2E suite's job).
- **Panel**: four reviewer voices (Product, Mobile/Accessibility, Localization,
  Trust & Safety) debate the findings and rank them.
- **Synthesis**: one prioritized list, then a feedback loop into the
  spec-driven framework.

---

## 2. Personas

### P1 — Jiří, 58 · Treasurer
Plays Saturday doubles, has handled the club's cash box for nine years. Android
phone two generations old, screen 5.5", uses reading glasses, taps with one
thumb while holding a beer in the other hand. Wants the money to *reconcile*
with the bank statement and resents anything that feels like "an app". Checks
beeromat on Sunday morning at the kitchen table, not at the club.

### P2 — Tereza, 34 · Member, marketing manager
iPhone 15, lives in apps, plays a weeknight league match then leaves fast for
childcare. Will log a beer in the 20 seconds it takes to pack her bag. Zero
patience for a screen that needs two hands or a second of thought.

### P3 — Standa, 67 · Stock manager, founding member
Owns the fridge, orders the beer. Basic Android phone, large fingers, taps the
wrong thing often, has never set a PIN anywhere and will forget it. Uses the
app maybe twice a month, each time as if for the first time.

### P4 — Marek, 23 · Member, student
The group's de-facto scorekeeper. Logs rounds for everyone, settles bets
constantly, fast and fluent. Will find every shortcut and every missing one.

### P5 — Pavel, 45 · Club admin
Set the club up, invites new members, configures the banking profile. Moderate
tech comfort. Touches admin screens rarely but when he does, expects them to be
self-explanatory because he won't remember last time.

---

## 3. Exploratory sessions & findings

Findings are tagged `[F#]` and carried into the panel and the final list.

### Session A — Tereza logs a beer (US1)
The golden path is genuinely fast: home → **Log a beer** → tap a tile → toast.
Three taps, sub-10-seconds. This is the product's best moment.

- **[F1]** The entire UI is in **English**. The club is Czech, `cs-CZ` is the
  default locale, `next-intl` is wired up — but every screen built for US1–US8
  hardcodes English strings. `messages/cs.json` only covers auth/PIN. Tereza
  shrugs; Jiří and Standa will not. This is the single largest gap.
- **[F2]** After logging, the toast is the only confirmation and it auto-
  dismisses. To believe it "worked" Tereza taps through to **My tab**. The home
  screen's balance does not visibly update without a manual revisit.
- **[F3]** No persistent navigation. Every journey is home → screen → back →
  home. On mobile this is a lot of round trips for a power pattern.

### Session B — Jiří reconciles payments (US3)
Jiří opens **Pending payments** on Sunday. The single-tap **Confirm received**
is exactly right — he confirms six claims in six taps and is done.

- **[F4]** The pending row packs name + date + variable symbol + note +
  amount + a checkbox + **Confirm received** + **Dispute** into one line. On
  Jiří's 5.5" screen with large text this wraps awkwardly and the two buttons
  sit close together — a mis-tap risks confirming instead of disputing.
- **[F5]** `Confirm received` and `Dispute` are both `size="sm"` (~28 px tall).
  Below the 44 px touch-target guideline the constitution itself cites (T166).
  Jiří, glasses on, thumb-only, is the exact person this hurts.
- **[F6]** Confirmation is irreversible from the UI's point of view — there is
  no undo affordance on the pending screen. `voidConfirmedPayment` exists in
  the action layer but no screen calls it. A fat-fingered confirm is stuck.
- **[F7]** Variable symbol shows as a bare number with no label-in-context;
  Jiří matches it against his bank statement and it works, but "VS 1003" needs
  to read as something he recognizes from Czech banking ("VS" is right, good).

### Session C — Standa, the occasional user (US7 + auth)
Standa signs in once a month. The magic-link → device-PIN flow means he meets
the **PIN gate** each time the 8-hour inactivity window has long expired.

- **[F8]** Standa set a PIN once and has forgotten it. The unlock screen's only
  escape is "sign in again with the link from your email" *after five wrong
  attempts lock the device*. There is no "forgot PIN — email me a link" on the
  unlock screen itself. He will burn five attempts first.
- **[F9]** Stock management is dense: each beer type row carries Restock,
  Adjust, Edit, Archive **and** a History link — five controls per row, several
  `size="sm"`. Standa wants one thing ("we got 2 crates of Pilsner") and must
  parse five. The primary action (Restock) is not visually dominant.
- **[F10]** Adjust uses a signed-number field ("Change (negative to reduce)").
  Standa does not think in signed integers. A −/+ stepper or two buttons
  ("Add stock" / "Remove stock") matches his mental model better.

### Session D — Marek settles bets (US6)
Marek lost a bet and takes Marek's… takes a teammate's drink. **Settle a bet**
→ **Transfer to me**. Fast and clear.

- **[F11]** The bet page hard-depends on an open session. If nobody has logged
  a beer yet, it shows "No open session" and a dead end — but a member cannot
  *open* a session; it only auto-opens on the first beer log. Marek, who wants
  to pre-settle a bet, is told to go away with no next step ("log a beer to
  start the session" would at least point somewhere).
- **[F12]** Transfers are listed per session but a member's *running* picture
  ("you owe 3 transferred drinks tonight") only exists as a number folded into
  the home balance. Marek, who does this constantly, wants a clearer tally.
- **[F13]** "Transfer to me" is irreversible-feeling: the **Undo** affordance
  is there, good — but only on the bet screen, and only for the creator or a
  treasurer. The winner whose drink was taken has no visibility on *their* tab
  that it happened, beyond the history screen.

### Session E — Pavel administers the club (US5 + banking)
Pavel invites members and sets the IBAN. The banking form's mod-97 IBAN check
catches a typo — a genuinely good save.

- **[F14]** Admin surface is scattered: members live at `/admin/members`,
  banking at `/admin/settings/banking`, beer types at `/admin/beer-types`.
  There is no single "Admin" hub; Pavel reaches banking only via a link buried
  on the members page. Twice a year, he will not remember where it is.
- **[F15]** No sign-out control is visible on the main screens. Auth has a
  `signOut` string but no screen surfaces the action. A shared clubhouse tablet
  scenario (if it ever happens) has no exit.
- **[F16]** Empty states are uneven: the log screen with no beer types is bleak
  (an empty grid), whereas history and balances have friendly empty copy.

### Cross-cutting observations
- **[F17]** Money input accepts `.` and `,` (good for Czech), but the rule is
  silent — no helper text, and a rejected value yields a generic toast.
- **[F18]** No skeleton/loading state between route transitions; on Jiří's slow
  phone + slow network the app looks frozen for a beat after each tap.
- **[F19]** The dispute banner is dismissible per-device via `localStorage` —
  fine — but a member who reads it on their phone still sees nothing actionable
  ("here's how to re-submit"); it informs but does not guide.
- **[F20]** `getPaymentHistory` is specified in `contracts/payments.md` but no
  screen exists for a member to see *their own* past payments — only the
  treasurer sees payment state. A member asking "did my 500 Kč land?" can see
  "pending confirmation" on Settle, but nothing once confirmed.

---

## 4. Reviewer panel

Four voices. The brief: argue, don't rubber-stamp; rank by user harm × reach.

**Product (Petra).** "F1, the missing Czech, is not a polish item — it is the
product failing its only audience. Half the personas are functionally locked
out. Everything else is secondary to it. F11 (bet dead end) and F20 (no member
payment history) are real holes in the *story*, not the styling."

**Mobile/Accessibility (Aydin).** "F5 and F4 are the ones that cause wrong
actions, not just slow ones — a treasurer confirming a payment he meant to
dispute is a trust failure. 44 px targets and separating destructive from
constructive actions are non-negotiable. F18 (no loading feedback) makes a fast
app feel broken on exactly the devices our older personas carry. F8 — the PIN
trap — will generate the first support call."

**Localization (Klára).** "Beyond F1: dates, the variable symbol, currency —
currency and dates already format via `Intl` with the club locale, good. But
the *strings* are the iceberg. And F17: Czechs type `1 234,50`; we accept
`,` but not the space, and we never say so. Localization is not translation;
it is the whole input grammar."

**Trust & Safety (Dan).** "F6 (no confirm-undo in the UI) worries me most. The
data model is fully auditable — `payment_state_transitions`, void actions all
exist — but the *UI* exposes a one-way door. If the audit trail can fix a
mistake and the screen can't, we've built a safe system with an unsafe face.
F15 (no sign-out) is lower reach but free to fix."

**Points of agreement after debate:**
- F1 is P0 and blocks a real launch to a Czech club. Unanimous.
- The "wrong action" cluster — F4, F5, F6 — outranks the "slow action"
  cluster — F2, F3, F18 — because reversibility and trust beat speed.
- F11 and F20 are scope gaps to feed back into the spec, not just UI tweaks.
- Several findings (F9, F10, F14) are "occasional user" problems: the app is
  tuned for Marek and taxes Standa. The club has more Standas.

**Dissent worth keeping:** Product wanted F20 (member payment history) as P1;
the panel settled P2 because Settle already shows "pending confirmation" and
the true gap is only *post*-confirmation. Recorded, not resolved.

---

## 5. Consolidated feedback — prioritized

| # | Priority | Finding | Recommended change |
|---|----------|---------|--------------------|
| 1 | **P0** | F1 — UI is English-only | Translate every US1–US8 screen; populate `cs.json`/`en.json`; make it a release gate (see §6). |
| 2 | **P0** | F5 — sub-44px touch targets | Raise primary action buttons to ≥44px; audit at 360×640. |
| 3 | **P0** | F4 — cramped/ambiguous pending row | Restructure: amount + name prominent, actions on their own line, visual gap between Confirm and Dispute. |
| 4 | **P1** | F6 — confirm has no UI undo | Surface `voidConfirmedPayment` on the pending/confirmed view with a short reason prompt. |
| 5 | **P1** | F8 — PIN lock-out trap | Add "Forgot PIN — email me a sign-in link" *on the unlock screen*, before lock-out. |
| 6 | **P1** | F11 — bet page dead end | When no session is open, link to "log a beer to start tonight's session". |
| 7 | **P1** | F3/F14 — no persistent nav, scattered admin | Add a bottom nav (Home/Log/Tab/More) and a single Admin hub. |
| 8 | **P1** | F18 — no loading feedback | Add route-level loading skeletons (Next.js `loading.tsx`). |
| 9 | **P2** | F20 — no member payment history | New screen: a member's own payment timeline (`getPaymentHistory`). |
| 10 | **P2** | F9/F10 — dense stock UI, signed-int input | Make Restock the dominant row action; replace signed field with Add/Remove. |
| 11 | **P2** | F2 — silent home balance | Revalidate or optimistically update the home balance after a log. |
| 12 | **P2** | F15 — no sign-out | Add sign-out to an account/More menu. |
| 13 | **P3** | F16 — uneven empty states | Friendly empty copy on the log screen. |
| 14 | **P3** | F17/F19 — silent input rules, inert banner | Helper text on money inputs; an action link on the dispute banner. |
| 15 | **P3** | F7/F12/F13 — bet/VS visibility polish | Minor copy + tally improvements. |

A v1.1 cut would be items 1–8 (all P0/P1). Items 9–10 are genuine scope
additions and should re-enter the spec pipeline, not the bug tracker.

---

## 6. Feedback into the spec-driven framework

The most useful output of this review is not the bug list — it is *why a green
pipeline still produced F1*. Each lesson below is proposed material for the
Spec Kit framework we use (constitution, templates, and the verification gates).

### L1 — A verification gate only protects what it can measure
`typecheck / lint / test:unit / build / test:e2e` all passed while the entire
UI shipped untranslated. The gates measure *correctness*, never *completeness
of intent*. Every task said "add cs + en translation keys" (T074, T096, T111,
T117, T131, T148, T156) and every one was silently skippable because nothing
fails when a string is hardcoded.
**Proposed material:** add a sixth gate — **`i18n:check`** — that fails the
build if any user-facing string is not resolved through `next-intl`, and if
`cs.json`/`en.json` key sets diverge. A gate that cannot be skipped beats a
task line that can.

### L2 — "Tasks" and "acceptance" must be the same surface
Translation was a *task* (T###) but never an *acceptance criterion* of any user
story, and never an E2E assertion. Work that lives only in the task list and
not in the spec's "Independent Test" is structurally optional under deadline
pressure.
**Proposed material:** the task template should forbid a task whose completion
is not observable by some gate or acceptance test. If it can't be verified, it
isn't a task — it's a hope.

### L3 — Personas belong in the spec, not the post-mortem
The spec optimized the golden path (fast logging — and that part is genuinely
good). But "occasional user" findings (F8, F9, F10, F14) cluster because no
persona like Standa was a first-class input to the spec. We discovered him
*after* building.
**Proposed material:** `/speckit-specify` should require a short **persona
set** (3–5) as a mandatory section, and each user story's acceptance scenarios
should name which persona they serve. A story that only ever serves the power
user is a flagged risk.

### L4 — Reversibility is a UX property, not just a data property
The data model is fully auditable and every compensating action exists
(`*_voids`, `voidConfirmedPayment`, dispute). Yet F6 shows a one-way door in
the UI. The constitution's "Auditable History" principle was satisfied in the
schema and violated in the interface.
**Proposed material:** extend the "Auditable History" principle with a UI
clause — *every reversible action must be reversible from the screen that
performed it* — and add it to the plan's Constitution Check.

### L5 — Build the verification rig early; it pays compound interest
The E2E rig (built mid-stream, panel-reviewed) caught three real production
bugs and every subsequent story was cheaper to verify. The lesson is timing:
the rig should be Phase 2 (Foundational), not discovered later.
**Proposed material:** the plan template should make "verification
infrastructure" an explicit Foundational deliverable, blocking user stories.

### L6 — Configuration-not-code survived contact with reality
The Test/Prod separation rule (constitution v1.3.0) and the SMTP-URL email
refactor both held: no environment branches leaked into `lib/`. This one is
*positive* feedback — keep the rule, and cite the email refactor in the
constitution as the worked example.

### Next step
Items 1–8 of §5 should be bundled into a **v1.1 spec** via `/speckit-specify`
(personas mandatory per L3); L1/L2/L4/L5 should be proposed as a constitution
amendment (v1.4.0) and template changes before that spec is written, so the
next cycle runs with the improved framework rather than around it.

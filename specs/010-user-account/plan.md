# Implementation Plan: User Account Page (v1.10)

**Branch**: `010-user-account` | **Date**: 2026-05-24 | **Spec**: [spec.md](./spec.md)

## Summary

`/account` already exists with minimal chrome (read-only name display, link to payment history, sign-out CTA). v1.10 augments it: above the existing controls, add a single editable form for the display name; below the form, add three stub rows (email, PIN, sign-out-all) marked "later". The submit goes through a new `updateAccountAction` that opens one Drizzle transaction writing to `users.name` AND `members.display_name` for the current user, then `revalidatePath('/', 'layout')` so the home greeting picks up the new name.

Zero schema changes, zero new entities, ~6 new i18n keys, ~30 LOC of action, ~80 LOC of form component, ~30 LOC of page integration.

## Technical Context

**Stack**: same as spec 009 (TypeScript 6.0, Next.js 16, React 19.2, Drizzle 0.45, Better Auth 1.6, next-intl 4, react-hook-form 7 + zodResolver, shadcn/ui Form/FormField/FormControl/FormLabel/FormMessage/Input/Button).

**Storage**: existing `users` (Better Auth schema) + `members` tables; both have `name` / `display_name` columns already. No migrations.

**Testing**: Vitest unit (PGlite via `vi.mock('@/lib/db/client')`), Playwright E2E.

**Target**: mobile-first single-screen form, ~1.5s FCP target.

**Constraints**: write to both tables in ONE transaction (FR-006 lock-step). Read context from `requireUnlocked()` which already returns `{ user, member, club }` — no extra session lookups.

## Constitution Check

- **I Mobile-First PWA** — ✅ single column form, one-thumb-reachable submit.
- **II Tenant-Aware Schema** — ✅ writes are scoped to the current user's records; no cross-tenant leak.
- **III Track, Don't Transact** — ✅ N/A.
- **IV Auth That Disappears** — ✅ uses `requireUnlocked()`; no auth UX change.
- **V Auditable History** — ✅ `users.updatedAt` / `members.updatedAt` capture the change; no append-only domain row needed (rename is not a money/stock/consumption event).
- **VI Free-Tier First** — ✅ no new infra.
- **VII Fresh Code Hygiene** — ✅ no version bumps.
- **User Input & Forms** — ✅ rh-form + zodResolver + catalog-key errors + no native validation.
- **i18n** — ✅ new `account.*` namespace, cs+en parity.

No Complexity Tracking entries.

## Project Structure

```text
app/[locale]/(app)/account/
├── page.tsx           # MODIFY — integrate AccountForm above existing controls
├── AccountForm.tsx    # NEW — client component, react-hook-form + zod
├── actions.ts         # NEW — updateAccountAction
└── payments/          # existing — unchanged

lib/validation/
└── account.ts         # NEW — accountSchema

messages/
├── cs.json            # MODIFY — extend account.* namespace
└── en.json            # MODIFY — extend account.* namespace

tests/
├── unit/
│   ├── account-schema.spec.ts   # NEW
│   └── account-action.spec.ts   # NEW
└── e2e/
    └── account.spec.ts          # NEW
```

## Tasks (inline — small spec, 7 tasks total)

1. **T001** [P] Add `account.*` keys to messages/cs.json + messages/en.json (form labels, submit, success, errors, three stub-row labels with "later" / "coming soon" badges).
2. **T002** [P] Create `lib/validation/account.ts` exporting `accountSchema` (`displayName: z.string().trim().min(1, error: 'account.errors.displayNameRequired').max(80, error: 'account.errors.displayNameTooLong')`).
3. **T003** Create `app/[locale]/(app)/account/actions.ts` exporting `updateAccountAction(input)` — parses with schema, in one Drizzle transaction updates `users.name` + `members.display_name` for ctx.user.id / ctx.member.id, calls `revalidatePath('/', 'layout')`, returns `{ ok: true } | { ok: false, code: 'VALIDATION_FAILED', fieldErrors }`.
4. **T004** [P] Create `app/[locale]/(app)/account/AccountForm.tsx` — client component, RHF + zodResolver, single `displayName` Input field, submit calls action, on `ok` shows sonner toast + form.reset(), on validation failure maps fieldErrors back to RHF setError.
5. **T005** Modify `app/[locale]/(app)/account/page.tsx` to render `<AccountForm initialDisplayName={ctx.member.displayName} />` above the existing payments link + sign-out card. Below the form, render the three stub rows (email, PIN, sign-out-all) as a styled but non-interactive list.
6. **T006** Create `tests/unit/account-schema.spec.ts` + `tests/unit/account-action.spec.ts` — schema edge cases (empty, whitespace, 80, 81 chars) + action happy path asserting both rows updated in lock-step.
7. **T007** Create `tests/e2e/account.spec.ts` — sign in as a member, navigate /account, see current name pre-filled, change it, submit, navigate /, assert new name in greeting + DB columns in sync.

**Parallelism**: T001 / T002 / T004 all [P] (different files). T003 depends on T002. T005 depends on T003 + T004. T006 depends on T002 + T003. T007 depends on everything.

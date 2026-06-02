'use server';

import { and, eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { requireUnlocked } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { members } from '@/lib/db/schema/members';
import {
  cancelAgreementTx,
  createAgreementTx,
  editAgreementTx,
  getAgreement,
  lastAgreementForMember,
  recordResultTx,
  reverseResultTx,
  type OpenAgreementSummary,
} from '@/lib/db/queries/match-agreements';
import { deliverBeerDebtTx } from '@/lib/db/queries/match-bet-debts';
import { closeOpenRoundTx } from '@/lib/db/queries/sessions';
import { canRecordMatchResult, roleSatisfies } from '@/lib/permissions';
import type { CreateAgreementInput } from '@/lib/validation/match-agreement';
import {
  cancelAgreementSchema,
  createAgreementSchema,
  deliverBeerDebtSchema,
  editAgreementSchema,
  recordResultSchema,
  reverseResultSchema,
} from '@/lib/validation/match-agreement';

// Spec 013 — match-agreement Server Actions.
//
// All actions follow the project convention:
//   - call requireUnlocked() first (session + PIN + tenant scope)
//   - validate input through the Zod schema (lib/validation/match-agreement)
//   - delegate the real work to a transactional helper in
//     lib/db/queries/match-agreements
//   - return a discriminated-union result so the client can render
//     typed errors
//   - revalidate /match (and / for tab updates) after writes
//
// FR-017 — the legacy 012 `logMatchAction` + `voidMatchAction` were
// removed when this module migrated to the agreement flow. New singles
// matches go through createAgreementAction + recordResultAction.

export type CreateAgreementResult =
  | { ok: true; agreementId: string }
  | { ok: false; code: 'VALIDATION_FAILED'; fieldErrors: Record<string, string[]> }
  | { ok: false; code: 'DUPLICATE_MEMBER' }
  | { ok: false; code: 'MEMBER_NOT_IN_CLUB' };

export async function createAgreementAction(rawInput: unknown): Promise<CreateAgreementResult> {
  const parsed = createAgreementSchema.safeParse(rawInput);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || '_root';
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { ok: false, code: 'VALIDATION_FAILED', fieldErrors };
  }
  const ctx = await requireUnlocked();
  const result = await createAgreementTx({
    clubId: ctx.club.id,
    createdByUserId: ctx.user.id,
    input: parsed.data,
  });
  if (result.ok) {
    revalidatePath('/match');
  }
  return result;
}

export type EditAgreementResult =
  | { ok: true }
  | { ok: false; code: 'VALIDATION_FAILED'; fieldErrors: Record<string, string[]> }
  | { ok: false; code: 'NOT_FOUND' }
  | { ok: false; code: 'NOT_AUTHORIZED' }
  | { ok: false; code: 'NOT_EDITABLE' }
  | { ok: false; code: 'DUPLICATE_MEMBER' }
  | { ok: false; code: 'MEMBER_NOT_IN_CLUB' };

export async function editAgreementAction(rawInput: unknown): Promise<EditAgreementResult> {
  const parsed = editAgreementSchema.safeParse(rawInput);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || '_root';
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { ok: false, code: 'VALIDATION_FAILED', fieldErrors };
  }
  const ctx = await requireUnlocked();
  // Spec 027 — same authz gap that was closed on cancel: edit also
  // needs the participant-or-treasurer+ gate per spec 013 FR-007.
  // Without this, any club member could edit any open agreement.
  const agreement = await getAgreement(parsed.data.agreementId, ctx.club.id);
  if (!agreement) return { ok: false, code: 'NOT_FOUND' };
  if (!canRecordMatchResult(ctx.member.id, ctx.member.role, agreement.participantMemberIds)) {
    return { ok: false, code: 'NOT_AUTHORIZED' };
  }
  const result = await editAgreementTx({
    agreementId: parsed.data.agreementId,
    clubId: ctx.club.id,
    input: parsed.data.patch,
  });
  if (result.ok) {
    revalidatePath('/match');
    revalidatePath(`/match/${parsed.data.agreementId}`);
  }
  return result;
}

export type CancelAgreementResult =
  | { ok: true }
  | { ok: false; code: 'NOT_FOUND' }
  | { ok: false; code: 'NOT_AUTHORIZED' }
  | { ok: false; code: 'NOT_CANCELLABLE' };

export async function cancelAgreementAction(rawInput: unknown): Promise<CancelAgreementResult> {
  const parsed = cancelAgreementSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, code: 'NOT_FOUND' };
  const ctx = await requireUnlocked();
  // Spec 027 — authz gap closed: cancel uses the same gate as record
  // (participant OR treasurer+), matching spec 013 FR-007. Prior to
  // this, any member of the club could cancel any open agreement
  // even ones they weren't a participant in.
  const agreement = await getAgreement(parsed.data.agreementId, ctx.club.id);
  if (!agreement) return { ok: false, code: 'NOT_FOUND' };
  if (!canRecordMatchResult(ctx.member.id, ctx.member.role, agreement.participantMemberIds)) {
    return { ok: false, code: 'NOT_AUTHORIZED' };
  }
  const result = await cancelAgreementTx({
    agreementId: parsed.data.agreementId,
    clubId: ctx.club.id,
    cancelledByUserId: ctx.user.id,
  });
  if (result.ok) revalidatePath('/match');
  return result;
}

export type RecordResultResult =
  | {
      ok: true;
      matchRowIds: string[];
      // Spec 030 — pending beer-debts created (0 for a friendly match).
      debtsCreated: number;
    }
  | { ok: false; code: 'NOT_FOUND' }
  | { ok: false; code: 'NOT_AUTHORIZED' }
  | {
      ok: false;
      code: 'ALREADY_RECORDED';
      recordedAt: Date;
      recordedByUserId: string | null;
    }
  | { ok: false; code: 'CANCELLED' };

export async function recordResultAction(rawInput: unknown): Promise<RecordResultResult> {
  const parsed = recordResultSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, code: 'NOT_FOUND' };
  const ctx = await requireUnlocked();

  // Authorization (FR-007): only participants OR treasurer-and-above.
  const agreement = await getAgreement(parsed.data.agreementId, ctx.club.id);
  if (!agreement) return { ok: false, code: 'NOT_FOUND' };
  if (!canRecordMatchResult(ctx.member.id, ctx.member.role, agreement.participantMemberIds)) {
    return { ok: false, code: 'NOT_AUTHORIZED' };
  }

  const result = await recordResultTx({
    agreementId: parsed.data.agreementId,
    clubId: ctx.club.id,
    recordedByUserId: ctx.user.id,
    winningSide: parsed.data.winningSide,
  });
  if (result.ok) {
    revalidatePath('/', 'layout');
    revalidatePath('/match');
  }
  return result;
}

// Spec 030 — deliver ("Předáno") a beer-IOU: books the cost to the
// loser + settles the debt. Either party to the debt, or a treasurer+,
// may deliver (re-validated in the tx).
export type DeliverBeerDebtResult =
  | { ok: true; beerName: string; loserName: string }
  | { ok: false; code: 'NOT_FOUND' }
  | { ok: false; code: 'FORBIDDEN' }
  | { ok: false; code: 'ALREADY_SETTLED' }
  | { ok: false; code: 'OUT_OF_STOCK' }
  | { ok: false; code: 'BEER_NOT_AVAILABLE' };

export async function deliverBeerDebtAction(rawInput: unknown): Promise<DeliverBeerDebtResult> {
  const parsed = deliverBeerDebtSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, code: 'NOT_FOUND' };
  const ctx = await requireUnlocked();

  const result = await deliverBeerDebtTx({
    debtId: parsed.data.debtId,
    clubId: ctx.club.id,
    actorUserId: ctx.user.id,
    actorMemberId: ctx.member.id,
    isElevated: roleSatisfies(ctx.member.role, 'treasurer'),
    beerTypeId: parsed.data.beerTypeId ?? null,
  });
  if (result.ok) {
    revalidatePath('/', 'layout');
    revalidatePath('/match');
    revalidatePath('/tab');
  }
  return result;
}

export type CloseRoundResult = { ok: true } | { ok: false; code: 'NO_OPEN_ROUND' };

/**
 * End the club's current round. Any member may close it — it's
 * communal, non-destructive (data is preserved; the round is just
 * segmented) end-of-night bookkeeping. The next logged beer opens a
 * fresh round. After close, the casual "take a drink" window for this
 * round's drinks is over (bets settle within a round).
 */
export async function closeRoundAction(): Promise<CloseRoundResult> {
  const ctx = await requireUnlocked();
  const result = await closeOpenRoundTx(ctx.club.id, ctx.user.id);
  if (result.ok) {
    revalidatePath('/match');
    revalidatePath('/tab');
    revalidatePath('/history');
    revalidatePath('/', 'layout');
  }
  return result;
}

export type ReverseResultResult =
  | { ok: true; voidedMatchCount: number; voidedTransferCount: number }
  | { ok: false; code: 'NOT_FOUND' }
  | { ok: false; code: 'NOT_AUTHORIZED' }
  | { ok: false; code: 'NOT_RECORDED' }
  | { ok: false; code: 'UNDO_WINDOW_EXPIRED' };

export async function reverseResultAction(rawInput: unknown): Promise<ReverseResultResult> {
  const parsed = reverseResultSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, code: 'NOT_FOUND' };
  const ctx = await requireUnlocked();

  const agreement = await getAgreement(parsed.data.agreementId, ctx.club.id);
  if (!agreement) return { ok: false, code: 'NOT_FOUND' };
  if (!canRecordMatchResult(ctx.member.id, ctx.member.role, agreement.participantMemberIds)) {
    return { ok: false, code: 'NOT_AUTHORIZED' };
  }

  const result = await reverseResultTx({
    agreementId: parsed.data.agreementId,
    clubId: ctx.club.id,
    reversedByUserId: ctx.user.id,
  });
  if (result.ok) {
    revalidatePath('/', 'layout');
  }
  return result;
}

// Spec 027 — Recreate last match. Clones the acting member's most
// recent agreement (any state) into a new OPEN agreement. Takes NO
// input: the source is re-resolved server-side so it always clones
// the genuinely-latest match (no client-trusted lineup, no IDOR, no
// stale-vs-latest race).
export type RecreateLastMatchResult =
  | { ok: true; agreementId: string }
  | { ok: false; code: 'NO_LAST_MATCH' }
  | { ok: false; code: 'STALE_PARTICIPANT'; memberName: string | null }
  | { ok: false; code: 'DUPLICATE_MEMBER' }
  | { ok: false; code: 'MEMBER_NOT_IN_CLUB' };

// Map a resolved agreement summary into the create-agreement input.
function summaryToCreateInput(summary: OpenAgreementSummary): CreateAgreementInput {
  const seat = (side: 'A' | 'B', n: 1 | 2): string =>
    summary.sides[side].find((s) => s.seat === n)!.memberId;
  if (summary.format === 'singles') {
    return {
      format: 'singles',
      forBeer: summary.forBeer,
      sides: { A: { seat1: seat('A', 1) }, B: { seat1: seat('B', 1) } },
    };
  }
  return {
    format: 'doubles',
    forBeer: summary.forBeer,
    pairingKind: (summary.pairingKind ?? 'straight') as 'straight' | 'crossed',
    sides: {
      A: { seat1: seat('A', 1), seat2: seat('A', 2) },
      B: { seat1: seat('B', 1), seat2: seat('B', 2) },
    },
  };
}

export async function recreateLastMatchAction(): Promise<RecreateLastMatchResult> {
  const ctx = await requireUnlocked();

  // Re-resolve the source server-side (never trust a client lineup).
  const last = await lastAgreementForMember(ctx.club.id, ctx.member.id);
  if (!last) return { ok: false, code: 'NO_LAST_MATCH' };

  // Active-participant guard. createAgreementTx validates club
  // membership but NOT active status — a deactivated-but-still-in-club
  // player would pass it and produce a match with a blocked
  // participant. Block here with a clear, named error (FR-007).
  const participantIds = [...last.sides.A, ...last.sides.B].map((s) => s.memberId);
  const activeRows = await db
    .select({ id: members.id, isActive: members.isActive })
    .from(members)
    .where(and(eq(members.clubId, ctx.club.id), inArray(members.id, participantIds)));
  const activeIds = new Set(activeRows.filter((r) => r.isActive).map((r) => r.id));
  const staleSeat = [...last.sides.A, ...last.sides.B].find(
    (s) => !activeIds.has(s.memberId),
  );
  if (staleSeat) {
    return { ok: false, code: 'STALE_PARTICIPANT', memberName: staleSeat.displayName };
  }

  const result = await createAgreementTx({
    clubId: ctx.club.id,
    createdByUserId: ctx.user.id,
    input: summaryToCreateInput(last),
  });
  if (result.ok) revalidatePath('/match');
  return result;
}


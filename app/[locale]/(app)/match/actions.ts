'use server';

import { revalidatePath } from 'next/cache';

import { requireUnlocked } from '@/lib/auth/session';
import {
  cancelAgreementTx,
  createAgreementTx,
  editAgreementTx,
  getAgreement,
  recordResultTx,
  reverseResultTx,
} from '@/lib/db/queries/match-agreements';
import { canRecordMatchResult } from '@/lib/permissions';
import {
  cancelAgreementSchema,
  createAgreementSchema,
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
      transferredCount: number;
      requestedCount: number;
      betBeerTypeId: string | null;
    }
  | { ok: false; code: 'NOT_FOUND' }
  | { ok: false; code: 'NOT_AUTHORIZED' }
  | {
      ok: false;
      code: 'ALREADY_RECORDED';
      recordedAt: Date;
      recordedByUserId: string | null;
    }
  | { ok: false; code: 'CANCELLED' }
  | { ok: false; code: 'NO_BEER_IN_STOCK' };

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
    betBeerOverrideId: parsed.data.betBeerOverrideId,
  });
  if (result.ok) {
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


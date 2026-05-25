'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';

import { requireUnlocked } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import {
  cancelAgreementTx,
  createAgreementTx,
  editAgreementTx,
  getAgreement,
  recordResultTx,
  reverseResultTx,
} from '@/lib/db/queries/match-agreements';
import { logMatchTx, voidMatchTx } from '@/lib/db/queries/matches';
import { matchAgreementSides } from '@/lib/db/schema/matches';
import { matches } from '@/lib/db/schema/matches';
import { canRecordMatchResult } from '@/lib/permissions';
import {
  cancelAgreementSchema,
  createAgreementSchema,
  editAgreementSchema,
  recordResultSchema,
  reverseResultSchema,
} from '@/lib/validation/match-agreement';
import { logMatchSchema } from '@/lib/validation/match';

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
// Legacy spec-012 `logMatchAction` + `voidMatchAction` are kept below
// during the US1 phase so the existing /match form keeps working;
// US2 deletes them along with the form (per FR-017).

// -- US1 / US2 / US3 / US4 — agreement-flow actions --------------------

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
  | { ok: false; code: 'NOT_CANCELLABLE' };

export async function cancelAgreementAction(rawInput: unknown): Promise<CancelAgreementResult> {
  const parsed = cancelAgreementSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, code: 'NOT_FOUND' };
  const ctx = await requireUnlocked();
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

// -- Legacy 012 quick-log actions (kept during US1; removed in US2) ----

export type LogMatchResult =
  | { ok: true; matchId: string; transferredCount: number; requestedCount: number }
  | { ok: false; code: 'VALIDATION_FAILED'; fieldErrors: Record<string, string[]> }
  | { ok: false; code: 'SELF_MATCH' };

export async function logMatchAction(rawInput: unknown): Promise<LogMatchResult> {
  const parsed = logMatchSchema.safeParse(rawInput);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || '_root';
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { ok: false, code: 'VALIDATION_FAILED', fieldErrors };
  }
  const ctx = await requireUnlocked();
  const { outcome, opponentMemberId } = parsed.data;
  if (opponentMemberId === ctx.member.id) return { ok: false, code: 'SELF_MATCH' };

  const winnerMemberId = outcome === 'won' ? ctx.member.id : opponentMemberId;
  const loserMemberId = outcome === 'won' ? opponentMemberId : ctx.member.id;
  const beerCount = Math.max(1, ctx.club.matchLoserBeerCount ?? 1);

  const result = await logMatchTx({
    clubId: ctx.club.id,
    winnerMemberId,
    loserMemberId,
    createdByUserId: ctx.user.id,
    beerCount,
  });
  revalidatePath('/', 'layout');
  return {
    ok: true,
    matchId: result.matchId,
    transferredCount: result.transferredCount,
    requestedCount: result.requestedCount,
  };
}

export type VoidMatchResult =
  | { ok: true; voidedTransferCount: number }
  | { ok: false; code: 'NOT_FOUND' | 'UNDO_WINDOW_EXPIRED' | 'ALREADY_VOIDED' };

const UNDO_WINDOW_MS = 5 * 60 * 1000;

export async function voidMatchAction(matchId: string): Promise<VoidMatchResult> {
  const ctx = await requireUnlocked();

  const matchRow = await db.query.matches.findFirst({
    where: and(eq(matches.id, matchId), eq(matches.clubId, ctx.club.id)),
  });
  if (!matchRow) return { ok: false, code: 'NOT_FOUND' };
  if (matchRow.voidedAt) return { ok: false, code: 'ALREADY_VOIDED' };

  const isWithinWindow = Date.now() - matchRow.createdAt.getTime() <= UNDO_WINDOW_MS;
  const isOriginalLogger = matchRow.createdByUserId === ctx.user.id;
  if (!isWithinWindow && !isOriginalLogger) {
    return { ok: false, code: 'UNDO_WINDOW_EXPIRED' };
  }

  const result = await voidMatchTx({
    matchId,
    clubId: ctx.club.id,
    voidedByUserId: ctx.user.id,
  });

  revalidatePath('/', 'layout');
  if (!result.voided) return { ok: false, code: 'ALREADY_VOIDED' };
  return { ok: true, voidedTransferCount: result.voidedTransferCount };
}

// Reference imports to silence "unused" lint complaints — these are
// used implicitly via the schema modules but the lint can't see it.
void matchAgreementSides;

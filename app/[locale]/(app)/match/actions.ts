'use server';

import { revalidatePath } from 'next/cache';

import { requireUnlocked } from '@/lib/auth/session';
import { logMatchTx, voidMatchTx } from '@/lib/db/queries/matches';
import { logMatchSchema } from '@/lib/validation/match';
import { db } from '@/lib/db/client';
import { matches } from '@/lib/db/schema/matches';
import { and, eq } from 'drizzle-orm';

// Spec 012 — match log + undo actions.
//
// logMatchAction(outcome, opponentMemberId): the caller is whichever
// member is signed in. outcome = 'won' → caller is winner, opponent
// is loser. outcome = 'lost' → caller is loser. The action looks up
// match_loser_beer_count from the club row to size the bet_transfer
// batch (best-effort — falls back to a matches-row-only insert if
// winner has no transferable consumptions in the open session).
//
// voidMatchAction: 5-minute undo window (constitution V reversibility
// + spec 001 convention). Outside the window only the original
// logger or a treasurer can void.

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
  if (opponentMemberId === ctx.member.id) {
    return { ok: false, code: 'SELF_MATCH' };
  }

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
    // Treasurer override is out of v1.12 scope; original logger can
    // still undo past the window for forgiveness.
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

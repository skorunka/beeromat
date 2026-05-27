import 'server-only';
import { and, desc, eq, ne, notExists, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { db } from '@/lib/db/client';
import { betTransferVoids, betTransfers } from '@/lib/db/schema/bets';
import { beerTypes } from '@/lib/db/schema/catalog';
import { consumptionVoids, consumptions } from '@/lib/db/schema/consumption';
import { members } from '@/lib/db/schema/members';
import { getOpenSessionForClub } from './sessions';
import type { DrinkSession } from '@/lib/db/schema/sessions';

// Spec 027 perf — two aliases on `members` so the bet-transfer
// query can resolve from + to display names + avatars in a single
// round-trip (was: main query + a second batched lookup).
const fromMembers = alias(members, 'from_members');
const toMembers = alias(members, 'to_members');

export interface TransferableConsumption {
  consumptionId: string;
  beerTypeName: string;
  unitPriceMinor: bigint;
  ownerMemberId: string;
  ownerDisplayName: string;
  ownerAvatarKey: string | null;
  ownerAvatarUploadAt: Date | null;
  loggedAt: Date;
}

/**
 * Pick list for the bet-transfer screen (contracts/bets.md): unvoided
 * consumptions in the club's currently-open session, owned by some
 * OTHER member, that are not already the source of an active transfer.
 */
export async function getTransferableConsumptionsForCurrentSession(args: {
  clubId: string;
  memberId: string;
}): Promise<{ session: DrinkSession | null; consumptions: TransferableConsumption[] }> {
  const session = await getOpenSessionForClub(args.clubId);
  if (!session) return { session: null, consumptions: [] };

  const rows = await db
    .select({
      consumptionId: consumptions.id,
      beerTypeName: beerTypes.name,
      unitPriceMinor: consumptions.unitPriceMinorSnapshot,
      ownerMemberId: consumptions.memberId,
      ownerDisplayName: members.displayName,
      ownerAvatarKey: members.avatarKey,
      ownerAvatarUploadAt: members.avatarUploadAt,
      loggedAt: consumptions.createdAt,
    })
    .from(consumptions)
    .innerJoin(beerTypes, eq(beerTypes.id, consumptions.beerTypeId))
    .innerJoin(members, eq(members.id, consumptions.memberId))
    .where(
      and(
        eq(consumptions.drinkSessionId, session.id),
        ne(consumptions.memberId, args.memberId),
        notExists(
          db
            .select()
            .from(consumptionVoids)
            .where(eq(consumptionVoids.consumptionId, consumptions.id)),
        ),
        notExists(
          db
            .select()
            .from(betTransfers)
            .where(
              and(
                eq(betTransfers.sourceConsumptionId, consumptions.id),
                notExists(
                  db
                    .select()
                    .from(betTransferVoids)
                    .where(eq(betTransferVoids.betTransferId, betTransfers.id)),
                ),
              ),
            ),
        ),
      ),
    )
    .orderBy(consumptions.createdAt);

  return { session, consumptions: rows };
}

export interface BetTransferRow {
  id: string;
  sourceConsumptionId: string;
  fromMemberId: string;
  fromMemberName: string;
  fromAvatarKey: string | null;
  fromAvatarUploadAt: Date | null;
  toMemberId: string;
  toMemberName: string;
  toAvatarKey: string | null;
  toAvatarUploadAt: Date | null;
  beerTypeName: string;
  unitPriceMinorSnapshot: bigint;
  createdAt: Date;
  createdByUserId: string;
  voided: boolean;
}

/**
 * Bet transfers whose source consumption is in a given session
 * (contracts/bets.md → getBetTransfersForSession). When `memberId` is
 * passed, only transfers that member is a party to (winner or loser).
 */
export async function getBetTransfersForSession(args: {
  sessionId: string;
  memberId?: string;
}): Promise<BetTransferRow[]> {
  const rows = await db
    .select({
      id: betTransfers.id,
      sourceConsumptionId: betTransfers.sourceConsumptionId,
      fromMemberId: betTransfers.fromMemberId,
      fromMemberName: fromMembers.displayName,
      fromAvatarKey: fromMembers.avatarKey,
      fromAvatarUploadAt: fromMembers.avatarUploadAt,
      toMemberId: betTransfers.toMemberId,
      toMemberName: toMembers.displayName,
      toAvatarKey: toMembers.avatarKey,
      toAvatarUploadAt: toMembers.avatarUploadAt,
      beerTypeName: beerTypes.name,
      unitPriceMinorSnapshot: consumptions.unitPriceMinorSnapshot,
      createdAt: betTransfers.createdAt,
      createdByUserId: betTransfers.createdByUserId,
      voidId: betTransferVoids.id,
    })
    .from(betTransfers)
    .innerJoin(consumptions, eq(consumptions.id, betTransfers.sourceConsumptionId))
    .innerJoin(beerTypes, eq(beerTypes.id, consumptions.beerTypeId))
    .innerJoin(fromMembers, eq(fromMembers.id, betTransfers.fromMemberId))
    .innerJoin(toMembers, eq(toMembers.id, betTransfers.toMemberId))
    .leftJoin(betTransferVoids, eq(betTransferVoids.betTransferId, betTransfers.id))
    .where(
      and(
        eq(consumptions.drinkSessionId, args.sessionId),
        args.memberId
          ? or(
              eq(betTransfers.fromMemberId, args.memberId),
              eq(betTransfers.toMemberId, args.memberId),
            )
          : undefined,
      ),
    )
    .orderBy(desc(betTransfers.createdAt));

  return rows.map((r) => ({
    id: r.id,
    sourceConsumptionId: r.sourceConsumptionId,
    fromMemberId: r.fromMemberId,
    fromMemberName: r.fromMemberName ?? '—',
    fromAvatarKey: r.fromAvatarKey ?? null,
    fromAvatarUploadAt: r.fromAvatarUploadAt ?? null,
    toMemberId: r.toMemberId,
    toMemberName: r.toMemberName ?? '—',
    toAvatarKey: r.toAvatarKey ?? null,
    toAvatarUploadAt: r.toAvatarUploadAt ?? null,
    beerTypeName: r.beerTypeName,
    unitPriceMinorSnapshot: r.unitPriceMinorSnapshot,
    createdAt: r.createdAt,
    createdByUserId: r.createdByUserId,
    voided: r.voidId !== null,
  }));
}

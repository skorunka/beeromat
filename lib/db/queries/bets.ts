import 'server-only';
import { and, desc, eq, inArray, ne, notExists, or } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { betTransferVoids, betTransfers } from '@/lib/db/schema/bets';
import { beerTypes } from '@/lib/db/schema/catalog';
import { consumptionVoids, consumptions } from '@/lib/db/schema/consumption';
import { members } from '@/lib/db/schema/members';
import { getOpenSessionForClub } from './sessions';
import type { DrinkSession } from '@/lib/db/schema/sessions';

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
      toMemberId: betTransfers.toMemberId,
      beerTypeName: beerTypes.name,
      unitPriceMinorSnapshot: consumptions.unitPriceMinorSnapshot,
      createdAt: betTransfers.createdAt,
      createdByUserId: betTransfers.createdByUserId,
      voidId: betTransferVoids.id,
    })
    .from(betTransfers)
    .innerJoin(consumptions, eq(consumptions.id, betTransfers.sourceConsumptionId))
    .innerJoin(beerTypes, eq(beerTypes.id, consumptions.beerTypeId))
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

  // Resolve winner/loser display names in one extra round-trip
  // (two joins to `members` would need table aliasing).
  const memberIds = new Set<string>();
  for (const r of rows) {
    memberIds.add(r.fromMemberId);
    memberIds.add(r.toMemberId);
  }
  const memberRows =
    memberIds.size > 0
      ? await db
          .select({
            id: members.id,
            displayName: members.displayName,
            avatarKey: members.avatarKey,
            avatarUploadAt: members.avatarUploadAt,
          })
          .from(members)
          .where(inArray(members.id, [...memberIds]))
      : [];
  const memberById = new Map(memberRows.map((m) => [m.id, m]));

  return rows.map((r) => {
    const from = memberById.get(r.fromMemberId);
    const to = memberById.get(r.toMemberId);
    return {
      id: r.id,
      sourceConsumptionId: r.sourceConsumptionId,
      fromMemberId: r.fromMemberId,
      fromMemberName: from?.displayName ?? '—',
      fromAvatarKey: from?.avatarKey ?? null,
      fromAvatarUploadAt: from?.avatarUploadAt ?? null,
      toMemberId: r.toMemberId,
      toMemberName: to?.displayName ?? '—',
      toAvatarKey: to?.avatarKey ?? null,
      toAvatarUploadAt: to?.avatarUploadAt ?? null,
      beerTypeName: r.beerTypeName,
      unitPriceMinorSnapshot: r.unitPriceMinorSnapshot,
      createdAt: r.createdAt,
      createdByUserId: r.createdByUserId,
      voided: r.voidId !== null,
    };
  });
}

import 'server-only';
import { and, desc, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { beerTypes } from '@/lib/db/schema/catalog';
import { consumptionVoids, consumptions } from '@/lib/db/schema/consumption';
import type { DrinkSession } from '@/lib/db/schema/sessions';

/** Shape of a single entry rendered on the my-tab screen. */
export interface MemberTabEntry {
  id: string;
  kind: 'consumption' | 'transfer_in' | 'transfer_out';
  beerTypeName: string;
  unitPriceMinor: bigint;
  createdAt: Date;
  voided: boolean;
  canUndo: boolean;
}

export interface MemberTab {
  session: DrinkSession | null;
  entries: MemberTabEntry[];
  totalMinor: bigint;
}

/**
 * Build the my-tab payload for a member in a session.
 * v1 (US1) only emits `consumption` entries; transfers will be added
 * alongside US6.
 */
export async function getMyTabForSession(args: {
  memberId: string;
  userId: string;
  session: DrinkSession | null;
  undoWindowSeconds: number;
}): Promise<MemberTab> {
  if (!args.session) {
    return { session: null, entries: [], totalMinor: 0n };
  }

  const rows = await db
    .select({
      consumptionId: consumptions.id,
      beerTypeName: beerTypes.name,
      unitPriceMinor: consumptions.unitPriceMinorSnapshot,
      createdAt: consumptions.createdAt,
      createdByUserId: consumptions.createdByUserId,
      voidId: consumptionVoids.id,
    })
    .from(consumptions)
    .innerJoin(beerTypes, eq(beerTypes.id, consumptions.beerTypeId))
    .leftJoin(consumptionVoids, eq(consumptionVoids.consumptionId, consumptions.id))
    .where(
      and(
        eq(consumptions.memberId, args.memberId),
        eq(consumptions.drinkSessionId, args.session.id),
      ),
    )
    .orderBy(desc(consumptions.createdAt));

  const now = Date.now();
  const windowMs = args.undoWindowSeconds * 1000;
  const entries: MemberTabEntry[] = rows.map((r) => {
    const voided = r.voidId !== null;
    const isLogger = r.createdByUserId === args.userId;
    const inWindow = now - r.createdAt.getTime() <= windowMs;
    return {
      id: r.consumptionId,
      kind: 'consumption' as const,
      beerTypeName: r.beerTypeName,
      unitPriceMinor: r.unitPriceMinor,
      createdAt: r.createdAt,
      voided,
      canUndo: !voided && isLogger && inWindow,
    };
  });

  const totalMinor = entries.reduce(
    (acc, e) => (e.voided ? acc : acc + e.unitPriceMinor),
    0n,
  );

  return { session: args.session, entries, totalMinor };
}

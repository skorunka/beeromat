/**
 * Badge-threshold analysis — prints the per-member distribution of each
 * badge stat (+ how many members clear candidate thresholds) so the catalog
 * thresholds can be tuned to be reachable-but-meaningful.
 *
 *   pnpm tsx --conditions=react-server --env-file-if-exists=.env.local scripts/analyze-badge-stats.ts
 *
 * Read-only. Run against the heavy-seed dev DB (a realistic ~2-year club).
 */
import { and, eq, isNull, ne, isNotNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { clubs } from '@/lib/db/schema/clubs';
import { members } from '@/lib/db/schema/members';
import { beerTypes } from '@/lib/db/schema/catalog';
import { consumptions, consumptionVoids } from '@/lib/db/schema/consumption';
import { matches } from '@/lib/db/schema/matches';

function describe(label: string, values: number[]) {
  const v = [...values].sort((a, b) => a - b);
  const n = v.length;
  if (n === 0) return console.log(`${label}: (no data)`);
  const pct = (p: number) => v[Math.min(n - 1, Math.floor((p / 100) * n))];
  console.log(
    `${label}: n=${n}  max=${v[n - 1]}  p90=${pct(90)}  p75=${pct(75)}  median=${pct(50)}  p25=${pct(25)}`,
  );
}

async function main() {
  const [club] = await db.select({ id: clubs.id, name: clubs.name }).from(clubs).limit(1);
  if (!club) throw new Error('no club');
  const clubId = club.id;
  console.log(`Club: ${club.name}\n`);

  const typeCount = (await db.select({ n: sql<number>`count(*)::int` }).from(beerTypes).where(eq(beerTypes.clubId, clubId)))[0]?.n ?? 0;
  console.log(`Total beer types in the club: ${typeCount}  (← Connoisseur gold can't exceed this)\n`);

  const beers = await db
    .select({ m: consumptions.memberId, n: sql<number>`count(*)::int` })
    .from(consumptions)
    .leftJoin(consumptionVoids, eq(consumptionVoids.consumptionId, consumptions.id))
    .where(and(eq(consumptions.clubId, clubId), isNull(consumptionVoids.consumptionId)))
    .groupBy(consumptions.memberId);
  describe('beers (Century Club)', beers.map((r) => r.n));

  const types = await db
    .select({ m: consumptions.memberId, n: sql<number>`count(distinct ${consumptions.beerTypeId})::int` })
    .from(consumptions)
    .leftJoin(consumptionVoids, eq(consumptionVoids.consumptionId, consumptions.id))
    .where(and(eq(consumptions.clubId, clubId), isNull(consumptionVoids.consumptionId)))
    .groupBy(consumptions.memberId);
  describe('distinct beer types (Connoisseur)', types.map((r) => r.n));

  const sessions = await db
    .select({ m: consumptions.memberId, n: sql<number>`count(distinct ${consumptions.drinkSessionId})::int` })
    .from(consumptions)
    .leftJoin(consumptionVoids, eq(consumptionVoids.consumptionId, consumptions.id))
    .where(and(eq(consumptions.clubId, clubId), isNull(consumptionVoids.consumptionId)))
    .groupBy(consumptions.memberId);
  describe('sessions attended (Night Owl)', sessions.map((r) => r.n));

  // rounds poured = distinct round_id the member logged for OTHERS
  const rounds = await db
    .select({ m: members.id, n: sql<number>`count(distinct ${consumptions.roundId})::int` })
    .from(consumptions)
    .innerJoin(members, and(eq(members.userId, consumptions.createdByUserId), eq(members.clubId, consumptions.clubId)))
    .where(and(eq(consumptions.clubId, clubId), ne(consumptions.memberId, members.id), isNotNull(consumptions.roundId)))
    .groupBy(members.id);
  describe('rounds poured (Round King)', rounds.map((r) => r.n));

  // wins + played (non-voided matches)
  const matchRows = await db
    .select({ w: matches.winnerMemberId, l: matches.loserMemberId })
    .from(matches)
    .where(and(eq(matches.clubId, clubId), isNull(matches.voidedAt)));
  const wins = new Map<string, number>();
  const played = new Map<string, number>();
  for (const m of matchRows) {
    wins.set(m.w, (wins.get(m.w) ?? 0) + 1);
    played.set(m.w, (played.get(m.w) ?? 0) + 1);
    played.set(m.l, (played.get(m.l) ?? 0) + 1);
  }
  describe('wins (Winner)', [...wins.values()]);
  describe('matches played (Regular)', [...played.values()]);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

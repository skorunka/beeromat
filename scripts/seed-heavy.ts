/**
 * Heavy operational data for LOAD TESTING on localhost.
 *
 * Simulates a 50+ member club over ~2 years of usage: hundreds of drink
 * sessions, thousands of consumptions (self + on-behalf + rounds),
 * hundreds of singles matches (recorded, some for beer → settled/pending
 * IOUs), and periodic member payments so balances look realistic.
 *
 *   pnpm db:reset:operational   # clean sheet: club + 50 members + beers
 *   pnpm db:seed:heavy          # layer ~2 years of activity on top
 *
 * Additive (running twice piles on more). Refuses non-local DATABASE_URL.
 * Doubles matches are intentionally omitted — singles keep every
 * matches/agreement/debt row trivially constraint-correct; partner stats
 * can be backfilled when the leaderboard feature lands.
 */
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { clubs } from '@/lib/db/schema/clubs';
import { members } from '@/lib/db/schema/members';
import { beerTypes } from '@/lib/db/schema/catalog';
import { drinkSessions } from '@/lib/db/schema/sessions';
import { consumptions } from '@/lib/db/schema/consumption';
import { matchAgreements, matchAgreementSides, matches } from '@/lib/db/schema/matches';
import { matchBetDebts } from '@/lib/db/schema/match-bet-debts';
import { payments } from '@/lib/db/schema/payments';
import { env } from '@/lib/env';

// ── Tunables ──────────────────────────────────────────────────────────
const WEEKS = 104; // ~2 years
const SESSIONS_PER_WEEK = 2;
const MIN_ATTENDEES = 8;
const MAX_ATTENDEES = 26;
const MIN_BEERS = 1;
const MAX_BEERS = 6;
const ON_BEHALF_CHANCE = 0.15; // a beer logged by someone else
const ROUND_CHANCE = 0.18; // an attendee's beers grouped as a round
const MATCHES_PER_SESSION_MAX = 3;
const SESSION_HAS_MATCHES_CHANCE = 0.7;
const FOR_BEER_CHANCE = 0.55;

// ── tiny rng helpers (Math.random is fine in a node script) ───────────
const rint = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const chance = (p: number) => Math.random() < p;
function pick<T>(arr: T[]): T {
  return arr[rint(0, arr.length - 1)]!;
}
function sample<T>(arr: T[], k: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = rint(0, i);
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy.slice(0, Math.min(k, copy.length));
}

function assertLocalTarget(): void {
  const url = env.DATABASE_URL;
  const looksLocal =
    url.includes('localhost') || url.includes('127.0.0.1') || Boolean(env.NEON_LOCAL_PROXY_HOST);
  if (!looksLocal) throw new Error(`[seed-heavy] Refusing: DATABASE_URL not local (${url}).`);
  if (env.NODE_ENV === 'production') throw new Error('[seed-heavy] Refusing: NODE_ENV=production');
}

async function insertBatched<T>(
  table: Parameters<typeof db.insert>[0],
  rows: T[],
  size = 1000,
): Promise<void> {
  for (let i = 0; i < rows.length; i += size) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.insert(table).values(rows.slice(i, i + size) as any);
  }
}

async function main(): Promise<void> {
  assertLocalTarget();
  console.log('[seed-heavy] Generating ~2 years of activity…');

  const club = await db.query.clubs.findFirst();
  if (!club) throw new Error('[seed-heavy] No club. Run pnpm db:reset:bootstrap first.');

  const roster = await db
    .select({ id: members.id, userId: members.userId })
    .from(members)
    .where(and(eq(members.clubId, club.id), eq(members.isActive, true)));
  if (roster.length < 4) {
    throw new Error('[seed-heavy] Need >=4 active members. Run pnpm db:reset:operational first.');
  }
  const beerList = await db
    .select({ id: beerTypes.id, price: beerTypes.unitPriceMinor })
    .from(beerTypes)
    .where(eq(beerTypes.clubId, club.id));
  if (beerList.length === 0) throw new Error('[seed-heavy] No beers. Run pnpm db:reset:operational.');

  const adminUserId = roster[0]!.userId;
  const userOf = new Map(roster.map((m) => [m.id, m.userId]));

  // Stock high enough that nothing matters for the seed.
  await db.update(beerTypes).set({ currentStock: 100000 }).where(eq(beerTypes.clubId, club.id));

  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const start = now - WEEKS * 7 * DAY;

  // Accumulators for batched inserts.
  const sessionRows: (typeof drinkSessions.$inferInsert)[] = [];
  const consumptionRows: (typeof consumptions.$inferInsert)[] = [];
  const agreementRows: (typeof matchAgreements.$inferInsert)[] = [];
  const sideRows: (typeof matchAgreementSides.$inferInsert)[] = [];
  const matchRows: (typeof matches.$inferInsert)[] = [];
  const debtRows: (typeof matchBetDebts.$inferInsert)[] = [];
  const spendByMember = new Map<string, bigint>();

  const totalSessions = WEEKS * SESSIONS_PER_WEEK;
  for (let s = 0; s < totalSessions; s++) {
    const sessionStart = new Date(start + (s / SESSIONS_PER_WEEK) * 7 * DAY + rint(17, 22) * 3600_000);
    const sessionEnd = new Date(sessionStart.getTime() + rint(2, 5) * 3600_000);
    const sessionId = randomUUID();
    sessionRows.push({
      id: sessionId,
      clubId: club.id,
      openedByUserId: adminUserId,
      startedAt: sessionStart,
      endedAt: sessionEnd,
    });

    const attendees = sample(roster, rint(MIN_ATTENDEES, Math.min(MAX_ATTENDEES, roster.length)));
    for (const m of attendees) {
      const n = rint(MIN_BEERS, MAX_BEERS);
      const roundId = chance(ROUND_CHANCE) ? randomUUID() : null;
      for (let b = 0; b < n; b++) {
        const beer = pick(beerList);
        const onBehalf = chance(ON_BEHALF_CHANCE);
        const loggerUser = onBehalf ? userOf.get(pick(attendees).id)! : userOf.get(m.id)!;
        const createdAt = new Date(sessionStart.getTime() + rint(0, 3) * 3600_000 + b * 600_000);
        consumptionRows.push({
          clubId: club.id,
          drinkSessionId: sessionId,
          memberId: m.id,
          beerTypeId: beer.id,
          unitPriceMinorSnapshot: beer.price,
          createdByUserId: loggerUser,
          createdAt,
          roundId,
        });
        spendByMember.set(m.id, (spendByMember.get(m.id) ?? 0n) + beer.price);
      }
    }

    // Matches for this session (singles, recorded).
    if (attendees.length >= 2 && chance(SESSION_HAS_MATCHES_CHANCE)) {
      const count = rint(1, MATCHES_PER_SESSION_MAX);
      for (let i = 0; i < count; i++) {
        const forBeer = chance(FOR_BEER_CHANCE);
        const betBeer = forBeer ? pick(beerList) : null;
        const agreementId = randomUUID();
        const playedAt = new Date(sessionStart.getTime() + rint(0, 2) * 3600_000);
        const doubles = attendees.length >= 4 && chance(0.4);
        // Side A always wins (deterministic for the seed); the recorder is
        // A's first seat. Each winner↔loser pair becomes one matches row +
        // (if for beer) one debt — exactly the record-result model.
        const pairs: { win: (typeof roster)[number]; lose: (typeof roster)[number] }[] = [];
        let recorderUserId: string;

        if (doubles) {
          const [a1, a2, b1, b2] = sample(attendees, 4);
          if (!a1 || !a2 || !b1 || !b2) continue;
          const pairingKind = chance(0.5) ? 'straight' : 'crossed';
          recorderUserId = userOf.get(a1.id)!;
          agreementRows.push({
            id: agreementId,
            clubId: club.id,
            format: 'doubles',
            forBeer,
            pairingKind,
            betBeerTypeId: betBeer?.id ?? null,
            winningSide: 'A',
            resultRecordedAt: playedAt,
            resultRecordedByUserId: recorderUserId,
            createdAt: new Date(playedAt.getTime() - 1800_000),
            createdByUserId: recorderUserId,
          });
          sideRows.push(
            { agreementId, side: 'A', seat: 1, memberId: a1.id },
            { agreementId, side: 'A', seat: 2, memberId: a2.id },
            { agreementId, side: 'B', seat: 1, memberId: b1.id },
            { agreementId, side: 'B', seat: 2, memberId: b2.id },
          );
          // straight → A1↔B1, A2↔B2; crossed → A1↔B2, A2↔B1 (winners on A).
          if (pairingKind === 'straight') {
            pairs.push({ win: a1, lose: b1 }, { win: a2, lose: b2 });
          } else {
            pairs.push({ win: a1, lose: b2 }, { win: a2, lose: b1 });
          }
        } else {
          const [w, l] = sample(attendees, 2);
          if (!w || !l) continue;
          recorderUserId = userOf.get(w.id)!;
          agreementRows.push({
            id: agreementId,
            clubId: club.id,
            format: 'singles',
            forBeer,
            pairingKind: null,
            betBeerTypeId: betBeer?.id ?? null,
            winningSide: 'A',
            resultRecordedAt: playedAt,
            resultRecordedByUserId: recorderUserId,
            createdAt: new Date(playedAt.getTime() - 1800_000),
            createdByUserId: recorderUserId,
          });
          sideRows.push(
            { agreementId, side: 'A', seat: 1, memberId: w.id },
            { agreementId, side: 'B', seat: 1, memberId: l.id },
          );
          pairs.push({ win: w, lose: l });
        }

        for (const { win, lose } of pairs) {
          const matchId = randomUUID();
          matchRows.push({
            id: matchId,
            clubId: club.id,
            winnerMemberId: win.id,
            loserMemberId: lose.id,
            agreementId,
            playedAt,
            createdByUserId: recorderUserId,
          });
          if (forBeer && betBeer) {
            // Older debts settled; the most recent ~2 weeks left pending so
            // the "Piva k předání" lists have live data.
            const isRecent = now - playedAt.getTime() < 14 * DAY;
            const settled = !isRecent || chance(0.5);
            debtRows.push({
              clubId: club.id,
              matchId,
              agreementId,
              fromMemberId: lose.id,
              toMemberId: win.id,
              plannedBeerTypeId: betBeer.id,
              beerCount: 1,
              status: settled ? 'settled' : 'pending',
              createdAt: playedAt,
              createdByUserId: recorderUserId,
              settledAt: settled ? new Date(playedAt.getTime() + rint(1, 20) * DAY) : null,
              settledByUserId: settled ? userOf.get(lose.id)! : null,
              settledBeerTypeId: settled ? betBeer.id : null,
            });
          }
        }
      }
    }
  }

  console.log(
    `[seed-heavy] Built ${sessionRows.length} sessions, ${consumptionRows.length} consumptions, ` +
      `${matchRows.length} matches (${debtRows.length} beer IOUs). Inserting…`,
  );

  await insertBatched(drinkSessions, sessionRows);
  await insertBatched(consumptions, consumptionRows);
  await insertBatched(matchAgreements, agreementRows);
  await insertBatched(matchAgreementSides, sideRows);
  await insertBatched(matches, matchRows);
  await insertBatched(matchBetDebts, debtRows);

  // Payments — each member settles ~75% of their accrued spend across a
  // few confirmed payments, leaving a realistic recent balance.
  const paymentRows: (typeof payments.$inferInsert)[] = [];
  for (const [memberId, total] of spendByMember) {
    if (total <= 0n) continue;
    const toPay = (total * 75n) / 100n;
    const chunks = rint(2, 5);
    const per = toPay / BigInt(chunks);
    if (per <= 0n) continue;
    for (let c = 0; c < chunks; c++) {
      paymentRows.push({
        clubId: club.id,
        memberId,
        amountMinor: per,
        currencyCode: club.currencyCode,
        status: 'confirmed',
        origin: 'member_initiated',
        createdAt: new Date(start + ((c + 1) / (chunks + 1)) * WEEKS * 7 * DAY),
        createdByUserId: userOf.get(memberId)!,
      });
    }
  }
  await insertBatched(payments, paymentRows);

  console.log(
    `[seed-heavy] Done. +${sessionRows.length} sessions, +${consumptionRows.length} consumptions, ` +
      `+${matchRows.length} matches, +${debtRows.length} IOUs, +${paymentRows.length} payments.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error('[seed-heavy] Failed:', err);
    process.exit(1);
  });

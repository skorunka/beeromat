/**
 * Spec 036 verify data — guarantees the surfaces with member-name links have
 * something to show for the logged-in viewer.
 *
 *   pnpm db:seed:verify036              # targets the member named "Franta"
 *   pnpm db:seed:verify036 "Pepa"       # or pass another display name
 *
 * Creates, in the viewer's club:
 *   1. an ON-BEHALF beer on the viewer's tab (someone logs a beer FOR them)
 *      → /tab shows "od {logger}" with the new profile link;
 *   2. an IOU the viewer OWES (home: "Dlužíš pivo {x}");
 *   3. an IOU owed TO the viewer (home: "{x} ti dluží pivo");
 *      → both IOU rows show the new counterparty profile link.
 *
 * Additive + idempotent-ish (re-running just adds more). Local DB only.
 */
import { and, eq, isNull, ne } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { members } from '@/lib/db/schema/members';
import { beerTypes } from '@/lib/db/schema/catalog';
import { drinkSessions } from '@/lib/db/schema/sessions';
import { consumptions } from '@/lib/db/schema/consumption';
import { createAgreementTx, recordResultTx } from '@/lib/db/queries/match-agreements';

const VIEWER_NAME = process.argv[2] ?? 'Franta';

async function main() {
  // Resolve the viewer by display name (the member the user logs in as), and
  // use THEIR club — robust even if the dev DB has more than one club.
  const viewer = (
    await db
      .select({ id: members.id, userId: members.userId, clubId: members.clubId, displayName: members.displayName })
      .from(members)
      .where(eq(members.displayName, VIEWER_NAME))
      .limit(1)
  )[0];
  if (!viewer) {
    const all = await db.select({ name: members.displayName }).from(members);
    throw new Error(
      `No member named "${VIEWER_NAME}". Pass one of: ${all.map((m) => m.name).join(', ')}`,
    );
  }
  const clubId = viewer.clubId;

  const others = await db
    .select({ id: members.id, userId: members.userId, displayName: members.displayName })
    .from(members)
    .where(and(eq(members.clubId, clubId), eq(members.isActive, true), ne(members.id, viewer.id)));
  if (others.length < 1) throw new Error('need at least one other member in the club');
  const logger = others[0]!;
  const oppOwe = others[1] ?? others[0]!; // viewer owes this one
  const oppOwed = others[2] ?? others[0]!; // this one owes the viewer

  const beer = (
    await db
      .select()
      .from(beerTypes)
      .where(and(eq(beerTypes.clubId, clubId), eq(beerTypes.isArchived, false)))
      .limit(1)
  )[0];
  if (!beer) throw new Error('no active beer type in the club');

  // 1) On-behalf beer on the viewer's tab.
  let open = (
    await db
      .select()
      .from(drinkSessions)
      .where(and(eq(drinkSessions.clubId, clubId), isNull(drinkSessions.endedAt)))
      .limit(1)
  )[0];
  if (!open) {
    open = (
      await db
        .insert(drinkSessions)
        .values({ clubId, openedByUserId: logger.userId, startedAt: new Date() })
        .returning()
    )[0];
  }
  if (!open) throw new Error('could not open a drink session');
  await db.insert(consumptions).values({
    clubId,
    drinkSessionId: open.id,
    memberId: viewer.id,
    beerTypeId: beer.id,
    unitPriceMinorSnapshot: beer.unitPriceMinor,
    createdByUserId: logger.userId,
  });
  console.log(`✓ On-behalf: ${logger.displayName} logged a ${beer.name} for ${viewer.displayName} (→ /tab "od ${logger.displayName}")`);

  // 2) IOU the viewer OWES (viewer loses to oppOwe).
  const a1 = await createAgreementTx({
    clubId,
    createdByUserId: viewer.userId,
    input: { format: 'singles', forBeer: true, betBeerTypeId: beer.id, sides: { A: { seat1: viewer.id }, B: { seat1: oppOwe.id } } },
  });
  if (a1.ok) {
    await recordResultTx({ agreementId: a1.agreementId, clubId, recordedByUserId: viewer.userId, winningSide: 'B' });
    console.log(`✓ IOU: ${viewer.displayName} owes ${oppOwe.displayName} a beer (→ home "Dlužíš pivo ${oppOwe.displayName}")`);
  } else {
    console.warn(`! could not create owe-IOU: ${a1.code}`);
  }

  // 3) IOU owed TO the viewer (oppOwed loses to viewer).
  const a2 = await createAgreementTx({
    clubId,
    createdByUserId: viewer.userId,
    input: { format: 'singles', forBeer: true, betBeerTypeId: beer.id, sides: { A: { seat1: viewer.id }, B: { seat1: oppOwed.id } } },
  });
  if (a2.ok) {
    await recordResultTx({ agreementId: a2.agreementId, clubId, recordedByUserId: viewer.userId, winningSide: 'A' });
    console.log(`✓ IOU: ${oppOwed.displayName} owes ${viewer.displayName} a beer (→ home "${oppOwed.displayName} ti dluží pivo")`);
  } else {
    console.warn(`! could not create owed-IOU: ${a2.code}`);
  }

  console.log(`\nDone for "${viewer.displayName}". Open /tab and the home screen to verify the new profile links.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('seed-036-verify failed:', err);
    process.exit(1);
  });

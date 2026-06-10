import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { makeTestDb, type TestDb } from '../helpers/db';

let testDb: TestDb;

vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

import { createAgreementTx, recordResultTx } from '@/lib/db/queries/match-agreements';
import {
  deliverBeerDebtTx,
  undeliverBeerDebtTx,
} from '@/lib/db/queries/match-bet-debts';
import { effectiveConsumptionTotal } from '@/lib/balance/calculate';
import { users } from '@/lib/db/schema/auth';
import { betTransfers, betTransferVoids } from '@/lib/db/schema/bets';
import { beerTypes } from '@/lib/db/schema/catalog';
import { consumptionVoids } from '@/lib/db/schema/consumption';
import { clubs } from '@/lib/db/schema/clubs';
import { matchBetDebts } from '@/lib/db/schema/match-bet-debts';
import { members } from '@/lib/db/schema/members';

interface Scene {
  clubId: string;
  userId: string;
  winnerId: string; // to_member
  loserId: string; // from_member
  outsiderId: string;
  beerId: string;
  debtId: string;
}

async function seedAndRecord(): Promise<Scene> {
  const [club] = await testDb
    .insert(clubs)
    .values({ name: 'TC', currencyCode: 'CZK', defaultLocale: 'cs' })
    .returning();
  if (!club) throw new Error('club');

  const mkUser = async (n: string) => {
    const [u] = await testDb
      .insert(users)
      .values({ email: `${n}@x.test`, name: n, emailVerified: true })
      .returning();
    if (!u) throw new Error('user');
    return u;
  };
  const mkMember = async (userId: string, name: string) => {
    const [m] = await testDb
      .insert(members)
      .values({
        clubId: club.id,
        userId,
        email: `${name}@x.test`,
        displayName: name,
        role: 'member',
        acceptedInvitationAt: new Date(),
      })
      .returning();
    if (!m) throw new Error('member');
    return m;
  };
  const u = await mkUser('actor');
  const uA = await mkUser('winner');
  const uB = await mkUser('loser');
  const uC = await mkUser('outsider');
  const memberA = await mkMember(uA.id, 'winner');
  const memberB = await mkMember(uB.id, 'loser');
  const memberC = await mkMember(uC.id, 'outsider');

  const [beer] = await testDb
    .insert(beerTypes)
    .values({ clubId: club.id, name: 'Pilsner', unitPriceMinor: 40n, currentStock: 5, createdByUserId: u.id })
    .returning();
  if (!beer) throw new Error('beer');

  const created = await createAgreementTx({
    clubId: club.id,
    createdByUserId: u.id,
    input: {
      format: 'singles',
      forBeer: true,
      sides: { A: { seat1: memberA.id }, B: { seat1: memberB.id } },
      betBeerTypeId: beer.id,
    },
  });
  if (!created.ok) throw new Error('create');
  const rec = await recordResultTx({
    agreementId: created.agreementId,
    clubId: club.id,
    recordedByUserId: u.id,
    winningSide: 'A',
  });
  if (!rec.ok) throw new Error('record');

  const [debt] = await testDb.select().from(matchBetDebts).where(eq(matchBetDebts.clubId, club.id));
  if (!debt) throw new Error('debt');

  return {
    clubId: club.id,
    userId: u.id,
    winnerId: memberA.id,
    loserId: memberB.id,
    outsiderId: memberC.id,
    beerId: beer.id,
    debtId: debt.id,
  };
}

async function deliver(s: Scene) {
  const r = await deliverBeerDebtTx({
    debtId: s.debtId,
    clubId: s.clubId,
    actorUserId: s.userId,
    actorMemberId: s.winnerId,
    isElevated: false,
  });
  if (!r.ok) throw new Error('deliver failed');
}

describe('undeliverBeerDebtTx — spec 030 delivery undo', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
  });

  it('restores the pending IOU and unwinds the booked cost + stock', async () => {
    const s = await seedAndRecord();
    await deliver(s);
    expect(await effectiveConsumptionTotal(s.loserId)).toBe(40n);

    const r = await undeliverBeerDebtTx({
      debtId: s.debtId,
      clubId: s.clubId,
      actorUserId: s.userId,
      actorMemberId: s.winnerId,
      isElevated: false,
    });
    expect(r.ok).toBe(true);

    // Debt back to pending, settle columns nulled (chk_..._consistency).
    const [debt] = await testDb.select().from(matchBetDebts).where(eq(matchBetDebts.id, s.debtId));
    expect(debt?.status).toBe('pending');
    expect(debt?.settledAt).toBeNull();
    expect(debt?.settledBeerTypeId).toBeNull();

    // Transfer + consumption voided, stock restored, loser back to 0.
    expect(await testDb.select().from(betTransferVoids)).toHaveLength(1);
    expect(await testDb.select().from(consumptionVoids)).toHaveLength(1);
    const [beer] = await testDb.select().from(beerTypes).where(eq(beerTypes.id, s.beerId));
    expect(beer?.currentStock).toBe(5); // -1 on deliver, +1 on undo
    expect(await effectiveConsumptionTotal(s.loserId)).toBe(0n);
  });

  it('refuses once the settledAt window has passed', async () => {
    const s = await seedAndRecord();
    await deliver(s);
    // Backdate the delivery beyond the 5-minute window.
    await testDb
      .update(matchBetDebts)
      .set({ settledAt: new Date(Date.now() - 6 * 60 * 1000) })
      .where(eq(matchBetDebts.id, s.debtId));

    const r = await undeliverBeerDebtTx({
      debtId: s.debtId,
      clubId: s.clubId,
      actorUserId: s.userId,
      actorMemberId: s.winnerId,
      isElevated: false,
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error();
    expect(r.code).toBe('UNDO_WINDOW_EXPIRED');

    // Untouched: still settled, transfer still live, cost still booked.
    const [debt] = await testDb.select().from(matchBetDebts).where(eq(matchBetDebts.id, s.debtId));
    expect(debt?.status).toBe('settled');
    expect(await testDb.select().from(betTransferVoids)).toHaveLength(0);
    expect(await effectiveConsumptionTotal(s.loserId)).toBe(40n);
  });

  it('rejects undoing a debt that was never delivered', async () => {
    const s = await seedAndRecord();
    const r = await undeliverBeerDebtTx({
      debtId: s.debtId,
      clubId: s.clubId,
      actorUserId: s.userId,
      actorMemberId: s.winnerId,
      isElevated: false,
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error();
    expect(r.code).toBe('NOT_DELIVERED');
  });

  it('forbids a non-party, non-elevated actor', async () => {
    const s = await seedAndRecord();
    await deliver(s);
    const r = await undeliverBeerDebtTx({
      debtId: s.debtId,
      clubId: s.clubId,
      actorUserId: s.userId,
      actorMemberId: s.outsiderId,
      isElevated: false,
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error();
    expect(r.code).toBe('FORBIDDEN');
  });

  it('the loser (a party) may also undo', async () => {
    const s = await seedAndRecord();
    await deliver(s);
    const r = await undeliverBeerDebtTx({
      debtId: s.debtId,
      clubId: s.clubId,
      actorUserId: s.userId,
      actorMemberId: s.loserId,
      isElevated: false,
    });
    expect(r.ok).toBe(true);
  });

  it('deliver→undo→deliver→undo never double-restores stock (notExists guard)', async () => {
    const s = await seedAndRecord();

    await deliver(s); // stock 4
    await undeliverBeerDebtTx({
      debtId: s.debtId,
      clubId: s.clubId,
      actorUserId: s.userId,
      actorMemberId: s.winnerId,
      isElevated: false,
    }); // stock 5
    await deliver(s); // stock 4
    const r = await undeliverBeerDebtTx({
      debtId: s.debtId,
      clubId: s.clubId,
      actorUserId: s.userId,
      actorMemberId: s.winnerId,
      isElevated: false,
    }); // stock 5
    expect(r.ok).toBe(true);

    const [beer] = await testDb.select().from(beerTypes).where(eq(beerTypes.id, s.beerId));
    expect(beer?.currentStock).toBe(5); // exactly back to start, not 6
    // Two deliveries → two transfers, both voided (one per undo cycle).
    expect(await testDb.select().from(betTransfers)).toHaveLength(2);
    expect(await testDb.select().from(betTransferVoids)).toHaveLength(2);
    expect(await effectiveConsumptionTotal(s.loserId)).toBe(0n);
  });
});

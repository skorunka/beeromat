import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTestDb, type TestDb } from '../helpers/db';

let testDb: TestDb;

vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

import {
  cancelAgreementTx,
  createAgreementTx,
  lastAgreementForMember,
  recordResultTx,
} from '@/lib/db/queries/match-agreements';
import { users } from '@/lib/db/schema/auth';
import { clubs } from '@/lib/db/schema/clubs';
import { members } from '@/lib/db/schema/members';

// Spec 027 — resolves the MEMBER's most recent participated agreement
// (any state), club-scoped. Drives the /match recreate control.

async function seedClubAndPlayers() {
  const [club] = await testDb
    .insert(clubs)
    .values({ name: 'TC', currencyCode: 'CZK', defaultLocale: 'cs' })
    .returning();
  async function user(name: string) {
    const [u] = await testDb
      .insert(users)
      .values({ email: `${name}-${Date.now()}-${Math.random()}@x.test`, name, emailVerified: true })
      .returning();
    return u!;
  }
  async function member(name: string, u: { id: string; email: string }) {
    const [m] = await testDb
      .insert(members)
      .values({
        clubId: club!.id,
        userId: u.id,
        email: u.email,
        displayName: name,
        role: 'member',
        acceptedInvitationAt: new Date(),
      })
      .returning();
    return m!;
  }
  const uA = await user('A');
  const uB = await user('B');
  const uC = await user('C');
  const uD = await user('D');
  const mA = await member('Alice', uA);
  const mB = await member('Bob', uB);
  const mC = await member('Carol', uC);
  const mD = await member('Dave', uD);
  return { club: club!, uA, mA, mB, mC, mD };
}

async function singles(opts: { clubId: string; by: string; a: string; b: string; forBeer?: boolean }) {
  const r = await createAgreementTx({
    clubId: opts.clubId,
    createdByUserId: opts.by,
    input: {
      format: 'singles',
      forBeer: opts.forBeer ?? false,
      sides: { A: { seat1: opts.a }, B: { seat1: opts.b } },
    },
  });
  if (!r.ok) throw new Error('seed singles');
  return r.agreementId;
}

describe('lastAgreementForMember', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
  });

  it('returns the member\'s most recent agreement when several exist', async () => {
    const { club, uA, mA, mB, mC } = await seedClubAndPlayers();
    await singles({ clubId: club.id, by: uA.id, a: mA.id, b: mB.id }); // older, Alice in it
    const newer = await singles({ clubId: club.id, by: uA.id, a: mA.id, b: mC.id }); // newer, Alice in it

    const result = await lastAgreementForMember(club.id, mA.id);
    expect(result?.id).toBe(newer);
    // Full lineup assembled.
    expect(result?.sides.A.map((s) => s.memberId)).toEqual([mA.id]);
    expect(result?.sides.B.map((s) => s.memberId)).toEqual([mC.id]);
  });

  it('returns a RECORDED agreement if it is the member\'s latest (state-agnostic)', async () => {
    const { club, uA, mA, mB } = await seedClubAndPlayers();
    const id = await singles({ clubId: club.id, by: uA.id, a: mA.id, b: mB.id });
    await recordResultTx({ agreementId: id, clubId: club.id, recordedByUserId: uA.id, winningSide: 'A' });

    const result = await lastAgreementForMember(club.id, mA.id);
    expect(result?.id).toBe(id);
  });

  it('returns a CANCELLED agreement if it is the member\'s latest (Q4)', async () => {
    const { club, uA, mA, mB } = await seedClubAndPlayers();
    const id = await singles({ clubId: club.id, by: uA.id, a: mA.id, b: mB.id });
    await cancelAgreementTx({ agreementId: id, clubId: club.id, cancelledByUserId: uA.id });

    const result = await lastAgreementForMember(club.id, mA.id);
    expect(result?.id).toBe(id);
  });

  it('ignores agreements the member is NOT a participant in', async () => {
    const { club, uA, mA, mB, mC, mD } = await seedClubAndPlayers();
    const aliceMatch = await singles({ clubId: club.id, by: uA.id, a: mA.id, b: mB.id }); // Alice in it
    await singles({ clubId: club.id, by: uA.id, a: mC.id, b: mD.id }); // newer, Alice NOT in it

    const result = await lastAgreementForMember(club.id, mA.id);
    expect(result?.id).toBe(aliceMatch);
  });

  it('per-club scoping — another club\'s newer agreement does not shadow', async () => {
    const a = await seedClubAndPlayers();
    const b = await seedClubAndPlayers();
    const aliceMatch = await singles({ clubId: a.club.id, by: a.uA.id, a: a.mA.id, b: a.mB.id });
    // Newer match in club B (different members).
    await singles({ clubId: b.club.id, by: b.uA.id, a: b.mA.id, b: b.mB.id });

    const result = await lastAgreementForMember(a.club.id, a.mA.id);
    expect(result?.id).toBe(aliceMatch);
  });

  it('returns null when the member has no agreements', async () => {
    const { club, mA } = await seedClubAndPlayers();
    expect(await lastAgreementForMember(club.id, mA.id)).toBeNull();
  });

  it('preserves doubles lineup (4 seats + pairing + forBeer)', async () => {
    const { club, uA, mA, mB, mC, mD } = await seedClubAndPlayers();
    const r = await createAgreementTx({
      clubId: club.id,
      createdByUserId: uA.id,
      input: {
        format: 'doubles',
        forBeer: true,
        pairingKind: 'crossed',
        sides: { A: { seat1: mA.id, seat2: mB.id }, B: { seat1: mC.id, seat2: mD.id } },
      },
    });
    if (!r.ok) throw new Error('seed doubles');

    const result = await lastAgreementForMember(club.id, mA.id);
    expect(result?.format).toBe('doubles');
    expect(result?.forBeer).toBe(true);
    expect(result?.pairingKind).toBe('crossed');
    expect(result?.sides.A.map((s) => s.seat)).toEqual([1, 2]);
    expect(result?.sides.B.map((s) => s.memberId)).toEqual([mC.id, mD.id]);
  });
});

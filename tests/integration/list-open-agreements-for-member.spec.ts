import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTestDb, type TestDb } from '../helpers/db';

let testDb: TestDb;

vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

import {
  createAgreementTx,
  listOpenAgreementsForMember,
  recordResultTx,
} from '@/lib/db/queries/match-agreements';
import { users } from '@/lib/db/schema/auth';
import { clubs } from '@/lib/db/schema/clubs';
import { members } from '@/lib/db/schema/members';

// Drives the home "match to record" prompt; the filter must isolate
// to participant matches only (no clutter for treasurers / outsiders),
// must not include recorded or cancelled agreements, and must scope
// per club.

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
  async function member(name: string, u: { id: string }) {
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
  const mA = await member('Alice', uA);
  const mB = await member('Bob', uB);
  const mC = await member('Carol', uC);
  return { club: club!, uA, uB, uC, mA, mB, mC };
}

async function seedAgreementSingles(opts: {
  clubId: string;
  createdByUserId: string;
  a: string;
  b: string;
}): Promise<string> {
  const r = await createAgreementTx({
    clubId: opts.clubId,
    createdByUserId: opts.createdByUserId,
    input: {
      format: 'singles',
      forBeer: false,
      sides: { A: { seat1: opts.a }, B: { seat1: opts.b } },
    },
  });
  if (!r.ok) throw new Error('seed agreement');
  return r.agreementId;
}

describe('listOpenAgreementsForMember', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
  });

  it('returns only agreements the member is a participant in', async () => {
    const { club, uA, mA, mB, mC } = await seedClubAndPlayers();
    // Alice vs Bob — Alice is a participant.
    const idAB = await seedAgreementSingles({
      clubId: club.id,
      createdByUserId: uA.id,
      a: mA.id,
      b: mB.id,
    });
    // Bob vs Carol — Alice is NOT a participant.
    await seedAgreementSingles({
      clubId: club.id,
      createdByUserId: uA.id,
      a: mB.id,
      b: mC.id,
    });

    const result = await listOpenAgreementsForMember(club.id, mA.id);
    expect(result.map((a) => a.id)).toEqual([idAB]);
  });

  it('excludes RECORDED agreements (only OPEN ones nudge the member)', async () => {
    const { club, uA, mA, mB } = await seedClubAndPlayers();
    const recorded = await seedAgreementSingles({
      clubId: club.id,
      createdByUserId: uA.id,
      a: mA.id,
      b: mB.id,
    });
    await recordResultTx({
      agreementId: recorded,
      clubId: club.id,
      recordedByUserId: uA.id,
      winningSide: 'A',
    });

    const result = await listOpenAgreementsForMember(club.id, mA.id);
    expect(result).toEqual([]);
  });

  it('scopes per club — another club\'s open match doesn\'t leak (Principle II)', async () => {
    const a = await seedClubAndPlayers();
    const b = await seedClubAndPlayers();
    // Open match in club B with players from B.
    await seedAgreementSingles({
      clubId: b.club.id,
      createdByUserId: b.uA.id,
      a: b.mA.id,
      b: b.mB.id,
    });
    // Alice in club A has no own open match.
    const result = await listOpenAgreementsForMember(a.club.id, a.mA.id);
    expect(result).toEqual([]);
  });

  it('empty when the member has no open matches', async () => {
    const { club, mA } = await seedClubAndPlayers();
    expect(await listOpenAgreementsForMember(club.id, mA.id)).toEqual([]);
  });
});

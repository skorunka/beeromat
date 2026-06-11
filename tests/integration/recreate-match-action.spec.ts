import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { makeTestDb, type TestDb } from '../helpers/db';

let testDb: TestDb;

vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

const ctxRef = {
  current: null as null | {
    user: { id: string };
    member: { id: string; role: string };
    club: { id: string };
  },
};

vi.mock('@/lib/auth/session', () => ({
  requireUnlocked: async () => ctxRef.current!,
  requireRole: async () => ctxRef.current!,
}));

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { recreateMatchAction } from '@/app/[locale]/(app)/match/actions';
import { createAgreementTx } from '@/lib/db/queries/match-agreements';
import { users } from '@/lib/db/schema/auth';
import { clubs } from '@/lib/db/schema/clubs';
import { members } from '@/lib/db/schema/members';
import { matchAgreements, matchAgreementSides } from '@/lib/db/schema/matches';

const NONEXISTENT_ID = '00000000-0000-4000-8000-000000000000';

async function seed() {
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
  return { club: club!, uA, uB, mA, mB, mC, mD };
}

function actAs(club: string, u: string, m: string) {
  ctxRef.current = { user: { id: u }, member: { id: m, role: 'member' }, club: { id: club } };
}

async function countAgreements(clubId: string): Promise<number> {
  const rows = await testDb.select().from(matchAgreements).where(eq(matchAgreements.clubId, clubId));
  return rows.length;
}

describe('recreateMatchAction (per-row repeat of an arbitrary match)', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
    ctxRef.current = null;
  });

  it('clones an arbitrary (NON-latest) agreement by id, not just the most recent', async () => {
    const { club, uA, mA, mB, mC, mD } = await seed();
    // Older target match (Alice vs Bob).
    const older = await createAgreementTx({
      clubId: club.id,
      createdByUserId: uA.id,
      input: { format: 'singles', forBeer: true, sides: { A: { seat1: mA.id }, B: { seat1: mB.id } } },
    });
    // A newer, different match (Carol vs Dave) — proves we don't just clone "last".
    await createAgreementTx({
      clubId: club.id,
      createdByUserId: uA.id,
      input: { format: 'singles', forBeer: false, sides: { A: { seat1: mC.id }, B: { seat1: mD.id } } },
    });
    if (!older.ok) throw new Error('seed');

    actAs(club.id, uA.id, mA.id);
    const result = await recreateMatchAction({ agreementId: older.agreementId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.agreementId).not.toBe(older.agreementId);
    expect(await countAgreements(club.id)).toBe(3);

    // The clone carries the OLDER match's lineup (Alice + Bob), not the newer one.
    const sides = await testDb.query.matchAgreementSides.findMany({
      where: eq(matchAgreementSides.agreementId, result.agreementId),
    });
    const ids = new Set(sides.map((s) => s.memberId));
    expect(ids).toEqual(new Set([mA.id, mB.id]));
    const clone = await testDb.query.matchAgreements.findFirst({
      where: eq(matchAgreements.id, result.agreementId),
    });
    expect(clone!.forBeer).toBe(true);
    expect(clone!.resultRecordedAt).toBeNull();
  });

  it('AGREEMENT_NOT_FOUND for a cross-club id (IDOR guard) — creates nothing', async () => {
    const a = await seed();
    const b = await seed();
    const srcB = await createAgreementTx({
      clubId: b.club.id,
      createdByUserId: b.uA.id,
      input: { format: 'singles', forBeer: false, sides: { A: { seat1: b.mA.id }, B: { seat1: b.mB.id } } },
    });
    if (!srcB.ok) throw new Error('seed');

    // Alice (club A) tries to clone club B's match.
    actAs(a.club.id, a.uA.id, a.mA.id);
    const result = await recreateMatchAction({ agreementId: srcB.agreementId });
    expect(result).toEqual({ ok: false, code: 'AGREEMENT_NOT_FOUND' });
    // Neither club gained an agreement.
    expect(await countAgreements(a.club.id)).toBe(0);
    expect(await countAgreements(b.club.id)).toBe(1);
  });

  it('AGREEMENT_NOT_FOUND for a nonexistent / malformed id', async () => {
    const { club, uA, mA } = await seed();
    actAs(club.id, uA.id, mA.id);
    expect(await recreateMatchAction({ agreementId: NONEXISTENT_ID })).toEqual({
      ok: false,
      code: 'AGREEMENT_NOT_FOUND',
    });
    expect(await recreateMatchAction({ agreementId: 'not-a-uuid' })).toEqual({
      ok: false,
      code: 'AGREEMENT_NOT_FOUND',
    });
  });

  it('STALE_PARTICIPANT when a source participant is now inactive — creates nothing', async () => {
    const { club, uA, mA, mB } = await seed();
    const src = await createAgreementTx({
      clubId: club.id,
      createdByUserId: uA.id,
      input: { format: 'singles', forBeer: false, sides: { A: { seat1: mA.id }, B: { seat1: mB.id } } },
    });
    if (!src.ok) throw new Error('seed');
    await testDb.update(members).set({ isActive: false }).where(eq(members.id, mB.id));

    actAs(club.id, uA.id, mA.id);
    const result = await recreateMatchAction({ agreementId: src.agreementId });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('STALE_PARTICIPANT');
    expect(await countAgreements(club.id)).toBe(1);
  });
});

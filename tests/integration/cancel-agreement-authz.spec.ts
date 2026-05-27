import { beforeEach, describe, expect, it, vi } from 'vitest';

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
}));

vi.mock('next/cache', () => ({
  revalidatePath: () => {},
}));

import { cancelAgreementAction } from '@/app/[locale]/(app)/match/actions';
import { createAgreementTx } from '@/lib/db/queries/match-agreements';

// Spec 027 — cancelAgreementAction had no authz check before today
// (any club member could cancel any open agreement). Verifying the
// new participant-or-treasurer+ gate works end-to-end through the
// action layer.

async function seedClubAndPlayers(opts: { thirdMemberRole?: 'member' | 'treasurer' } = {}) {
  const { users } = await import('@/lib/db/schema/auth');
  const { clubs } = await import('@/lib/db/schema/clubs');
  const { members } = await import('@/lib/db/schema/members');

  const [club] = await testDb
    .insert(clubs)
    .values({ name: 'Test', currencyCode: 'CZK', defaultLocale: 'cs-CZ' })
    .returning();
  if (!club) throw new Error('seed club');

  async function seed(name: string, role: 'member' | 'treasurer' = 'member') {
    const [u] = await testDb
      .insert(users)
      .values({ email: `${name}-${Date.now()}-${Math.random()}@example.test`, name })
      .returning();
    if (!u) throw new Error(`seed user ${name}`);
    const [m] = await testDb
      .insert(members)
      .values({
        clubId: club.id,
        userId: u.id,
        email: u.email,
        displayName: name,
        role,
      })
      .returning();
    if (!m) throw new Error(`seed member ${name}`);
    return { u, m };
  }

  const alice = await seed('alice');
  const bob = await seed('bob');
  const third = await seed('third', opts.thirdMemberRole ?? 'member');
  return { club, alice, bob, third };
}

describe('cancelAgreementAction authz — spec 027', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
    ctxRef.current = null;
  });

  it('rejects a non-participant non-treasurer with NOT_AUTHORIZED', async () => {
    const { club, alice, bob, third } = await seedClubAndPlayers({
      thirdMemberRole: 'member',
    });

    // alice + bob agree to play singles.
    const agreement = await createAgreementTx({
      clubId: club.id,
      createdByUserId: alice.u.id,
      input: {
        format: 'singles',
        forBeer: false,
        sides: { A: { seat1: alice.m.id }, B: { seat1: bob.m.id } },
      },
    });
    if (!agreement.ok) throw new Error('seed agreement');

    // `third` is in the club but NOT a participant. Cancel must reject.
    ctxRef.current = {
      user: { id: third.u.id },
      member: { id: third.m.id, role: 'member' },
      club: { id: club.id },
    };
    const result = await cancelAgreementAction({ agreementId: agreement.agreementId });
    expect(result).toEqual({ ok: false, code: 'NOT_AUTHORIZED' });
  });

  it('allows a participant to cancel', async () => {
    const { club, alice, bob } = await seedClubAndPlayers();
    const agreement = await createAgreementTx({
      clubId: club.id,
      createdByUserId: alice.u.id,
      input: {
        format: 'singles',
        forBeer: false,
        sides: { A: { seat1: alice.m.id }, B: { seat1: bob.m.id } },
      },
    });
    if (!agreement.ok) throw new Error('seed agreement');

    // alice IS a participant — cancel must succeed.
    ctxRef.current = {
      user: { id: alice.u.id },
      member: { id: alice.m.id, role: 'member' },
      club: { id: club.id },
    };
    const result = await cancelAgreementAction({ agreementId: agreement.agreementId });
    expect(result).toEqual({ ok: true });
  });

  it('allows a non-participant TREASURER to cancel (override path)', async () => {
    const { club, alice, bob, third } = await seedClubAndPlayers({
      thirdMemberRole: 'treasurer',
    });
    const agreement = await createAgreementTx({
      clubId: club.id,
      createdByUserId: alice.u.id,
      input: {
        format: 'singles',
        forBeer: false,
        sides: { A: { seat1: alice.m.id }, B: { seat1: bob.m.id } },
      },
    });
    if (!agreement.ok) throw new Error('seed agreement');

    // `third` is a treasurer, not a participant. Cancel must succeed.
    ctxRef.current = {
      user: { id: third.u.id },
      member: { id: third.m.id, role: 'treasurer' },
      club: { id: club.id },
    };
    const result = await cancelAgreementAction({ agreementId: agreement.agreementId });
    expect(result).toEqual({ ok: true });
  });

  it('returns NOT_FOUND when the agreement does not exist (or belongs to a different club)', async () => {
    const { club, alice } = await seedClubAndPlayers();
    ctxRef.current = {
      user: { id: alice.u.id },
      member: { id: alice.m.id, role: 'member' },
      club: { id: club.id },
    };
    const result = await cancelAgreementAction({
      agreementId: '00000000-0000-0000-0000-000000000000',
    });
    expect(result).toEqual({ ok: false, code: 'NOT_FOUND' });
  });
});

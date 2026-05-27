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
  requireRole: async () => ctxRef.current!,
}));

vi.mock('next/cache', () => ({
  revalidatePath: () => {},
}));

import { editAgreementAction } from '@/app/[locale]/(app)/match/actions';
import { createAgreementTx, editAgreementTx, recordResultTx } from '@/lib/db/queries/match-agreements';

async function seedClubAndPlayers(opts: {
  thirdRole?: 'member' | 'treasurer';
} = {}) {
  const { users } = await import('@/lib/db/schema/auth');
  const { clubs } = await import('@/lib/db/schema/clubs');
  const { members } = await import('@/lib/db/schema/members');

  const [club] = await testDb
    .insert(clubs)
    .values({ name: 'Test', currencyCode: 'CZK', defaultLocale: 'cs-CZ' })
    .returning();
  if (!club) throw new Error('seed club');
  const clubId = club.id;

  async function seed(name: string, role: 'member' | 'treasurer' = 'member') {
    const [u] = await testDb
      .insert(users)
      .values({ email: `${name}-${Date.now()}-${Math.random()}@example.test`, name })
      .returning();
    if (!u) throw new Error(`seed user ${name}`);
    const [m] = await testDb
      .insert(members)
      .values({
        clubId,
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
  const third = await seed('third', opts.thirdRole ?? 'member');
  return { club, alice, bob, third };
}

async function seedAgreement(opts: {
  clubId: string;
  createdByUserId: string;
  a: string;
  b: string;
}) {
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

describe('editAgreementAction', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
    ctxRef.current = null;
  });

  it('happy path — a participant can edit the lineup', async () => {
    const { club, alice, bob, third } = await seedClubAndPlayers();
    const agreementId = await seedAgreement({
      clubId: club.id,
      createdByUserId: alice.u.id,
      a: alice.m.id,
      b: bob.m.id,
    });

    ctxRef.current = {
      user: { id: alice.u.id },
      member: { id: alice.m.id, role: 'member' },
      club: { id: club.id },
    };
    const result = await editAgreementAction({
      agreementId,
      patch: {
        format: 'singles',
        forBeer: false,
        sides: { A: { seat1: alice.m.id }, B: { seat1: third.m.id } },
      },
    });
    expect(result).toEqual({ ok: true });
  });

  it('rejects a non-participant non-treasurer with NOT_AUTHORIZED (spec 027 gap)', async () => {
    const { club, alice, bob, third } = await seedClubAndPlayers();
    const agreementId = await seedAgreement({
      clubId: club.id,
      createdByUserId: alice.u.id,
      a: alice.m.id,
      b: bob.m.id,
    });

    // `third` is in the club but NOT a participant — must reject.
    ctxRef.current = {
      user: { id: third.u.id },
      member: { id: third.m.id, role: 'member' },
      club: { id: club.id },
    };
    const result = await editAgreementAction({
      agreementId,
      patch: {
        format: 'singles',
        forBeer: false,
        sides: { A: { seat1: third.m.id }, B: { seat1: bob.m.id } },
      },
    });
    expect(result).toEqual({ ok: false, code: 'NOT_AUTHORIZED' });
  });

  it('non-participant TREASURER can edit (override path)', async () => {
    const { club, alice, bob, third } = await seedClubAndPlayers({
      thirdRole: 'treasurer',
    });
    const agreementId = await seedAgreement({
      clubId: club.id,
      createdByUserId: alice.u.id,
      a: alice.m.id,
      b: bob.m.id,
    });

    ctxRef.current = {
      user: { id: third.u.id },
      member: { id: third.m.id, role: 'treasurer' },
      club: { id: club.id },
    };
    const result = await editAgreementAction({
      agreementId,
      patch: {
        format: 'singles',
        forBeer: true,
        sides: { A: { seat1: alice.m.id }, B: { seat1: bob.m.id } },
      },
    });
    expect(result).toEqual({ ok: true });
  });

  it('NOT_FOUND on a non-existent agreement id', async () => {
    const { club, alice, bob } = await seedClubAndPlayers();
    ctxRef.current = {
      user: { id: alice.u.id },
      member: { id: alice.m.id, role: 'member' },
      club: { id: club.id },
    };
    const result = await editAgreementAction({
      agreementId: '00000000-0000-0000-0000-000000000000',
      patch: {
        format: 'singles',
        forBeer: false,
        sides: { A: { seat1: alice.m.id }, B: { seat1: bob.m.id } },
      },
    });
    expect(result).toEqual({ ok: false, code: 'NOT_FOUND' });
  });

  it('NOT_EDITABLE when the agreement is already recorded', async () => {
    const { club, alice, bob } = await seedClubAndPlayers();
    const agreementId = await seedAgreement({
      clubId: club.id,
      createdByUserId: alice.u.id,
      a: alice.m.id,
      b: bob.m.id,
    });
    // Record the result, then try to edit.
    await recordResultTx({
      agreementId,
      clubId: club.id,
      winningSide: 'A',
      recordedByUserId: alice.u.id,
    });

    ctxRef.current = {
      user: { id: alice.u.id },
      member: { id: alice.m.id, role: 'member' },
      club: { id: club.id },
    };
    const result = await editAgreementAction({
      agreementId,
      patch: {
        format: 'singles',
        forBeer: false,
        sides: { A: { seat1: alice.m.id }, B: { seat1: bob.m.id } },
      },
    });
    expect(result).toEqual({ ok: false, code: 'NOT_EDITABLE' });
  });

  it('action returns VALIDATION_FAILED on duplicate seats (Zod catches before tx)', async () => {
    // The duplicate-member case at the action layer is structurally
    // rejected by the Zod schema's superRefine BEFORE the tx-level
    // DUPLICATE_MEMBER defense can fire. Both layers protect the
    // invariant; the tests below cover them separately.
    const { club, alice, bob } = await seedClubAndPlayers();
    const agreementId = await seedAgreement({
      clubId: club.id,
      createdByUserId: alice.u.id,
      a: alice.m.id,
      b: bob.m.id,
    });
    ctxRef.current = {
      user: { id: alice.u.id },
      member: { id: alice.m.id, role: 'member' },
      club: { id: club.id },
    };
    const result = await editAgreementAction({
      agreementId,
      patch: {
        format: 'singles',
        forBeer: false,
        sides: { A: { seat1: alice.m.id }, B: { seat1: alice.m.id } },
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('VALIDATION_FAILED');
  });

  it('editAgreementTx DUPLICATE_MEMBER — defense-in-depth at the tx layer', async () => {
    // Bypass the action (and its Zod gate) and call the tx directly
    // with duplicate seats. The tx must reject independently — if
    // someone introduces a new caller that skips the schema, the
    // invariant still holds.
    const { club, alice, bob } = await seedClubAndPlayers();
    const agreementId = await seedAgreement({
      clubId: club.id,
      createdByUserId: alice.u.id,
      a: alice.m.id,
      b: bob.m.id,
    });
    const r = await editAgreementTx({
      agreementId,
      clubId: club.id,
      input: {
        format: 'singles',
        forBeer: false,
        sides: { A: { seat1: alice.m.id }, B: { seat1: alice.m.id } },
      },
    });
    expect(r).toEqual({ ok: false, code: 'DUPLICATE_MEMBER' });
  });

  it('VALIDATION_FAILED on malformed input', async () => {
    const { club, alice } = await seedClubAndPlayers();
    ctxRef.current = {
      user: { id: alice.u.id },
      member: { id: alice.m.id, role: 'member' },
      club: { id: club.id },
    };
    const result = await editAgreementAction({
      // missing agreementId
      patch: {
        format: 'singles',
        forBeer: false,
        sides: { A: { seat1: alice.m.id }, B: { seat1: alice.m.id } },
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('VALIDATION_FAILED');
  });
});

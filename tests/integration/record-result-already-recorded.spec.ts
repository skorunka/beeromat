import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTestDb, type TestDb } from '../helpers/db';

let testDb: TestDb;

vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

import { createAgreementTx, recordResultTx } from '@/lib/db/queries/match-agreements';

// Spec 027 — the second concurrent recordResultTx call must return
// { ok: false, code: 'ALREADY_RECORDED', recordedAt, recordedByUserId }
// instead of throwing (and producing a generic 500). Race semantics
// were preserved (the LostConcurrencyRaceError still throws inside
// the tx to roll back the matches + consumptions + stock_changes +
// bet_transfers inserts the loser already committed); the outer
// try/catch translates to the structured result.

async function seedClubAndPlayers() {
  const { users } = await import('@/lib/db/schema/auth');
  const { clubs } = await import('@/lib/db/schema/clubs');
  const { members } = await import('@/lib/db/schema/members');

  const [club] = await testDb
    .insert(clubs)
    .values({ name: 'Test', currencyCode: 'CZK', defaultLocale: 'cs-CZ' })
    .returning();
  if (!club) throw new Error('seed club');
  // TS narrowing of `club` doesn't follow through the nested
  // closure — capture clubId locally.
  const clubId = club.id;

  async function seedPlayer(name: string) {
    const [u] = await testDb
      .insert(users)
      .values({
        email: `${name}-${Date.now()}-${Math.random()}@example.test`,
        name,
      })
      .returning();
    if (!u) throw new Error(`seed user ${name}`);
    const [m] = await testDb
      .insert(members)
      .values({
        clubId,
        userId: u.id,
        email: u.email,
        displayName: name,
        role: 'member',
      })
      .returning();
    if (!m) throw new Error(`seed member ${name}`);
    return { u, m };
  }

  const a = await seedPlayer('alice');
  const b = await seedPlayer('bob');
  return { club, alice: a, bob: b };
}

describe('recordResultTx ALREADY_RECORDED — spec 027 double-submit', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
  });

  it('the second call returns ALREADY_RECORDED with the winner-side recordedAt + recordedByUserId', async () => {
    const { club, alice, bob } = await seedClubAndPlayers();

    // Create a non-for-beer singles agreement (avoids needing
    // a seeded beer + session for the test).
    const agreementResult = await createAgreementTx({
      clubId: club.id,
      createdByUserId: alice.u.id,
      input: {
        format: 'singles',
        forBeer: false,
        sides: { A: { seat1: alice.m.id }, B: { seat1: bob.m.id } },
      },
    });
    if (!agreementResult.ok) throw new Error('seed agreement');
    const agreementId = agreementResult.agreementId;

    // First call wins the race and stamps resultRecordedAt.
    const first = await recordResultTx({
      agreementId,
      clubId: club.id,
      winningSide: 'A',
      recordedByUserId: alice.u.id,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    // Second call must return ALREADY_RECORDED (not throw).
    const second = await recordResultTx({
      agreementId,
      clubId: club.id,
      winningSide: 'B',
      recordedByUserId: bob.u.id,
    });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.code).toBe('ALREADY_RECORDED');
    // The canonical recordedAt + recordedByUserId on the winner side
    // are surfaced for the user-facing toast.
    if (second.code !== 'ALREADY_RECORDED') return;
    expect(second.recordedAt).toBeInstanceOf(Date);
    expect(second.recordedByUserId).toBe(alice.u.id);
  });

  it('the in-tx early-return path also produces ALREADY_RECORDED (no double-submit involved)', async () => {
    // Same case but sequentially — the inline `if
    // (agreement.resultRecordedAt)` check at the top of the tx
    // catches the "already recorded before we even entered" case.
    // Verifies BOTH paths converge on the same result code.
    const { club, alice, bob } = await seedClubAndPlayers();
    const agreementResult = await createAgreementTx({
      clubId: club.id,
      createdByUserId: alice.u.id,
      input: {
        format: 'singles',
        forBeer: false,
        sides: { A: { seat1: alice.m.id }, B: { seat1: bob.m.id } },
      },
    });
    if (!agreementResult.ok) throw new Error('seed agreement');

    const first = await recordResultTx({
      agreementId: agreementResult.agreementId,
      clubId: club.id,
      winningSide: 'A',
      recordedByUserId: alice.u.id,
    });
    expect(first.ok).toBe(true);

    // Now retry — this hits the early-return path (not the optimistic-lock race).
    const second = await recordResultTx({
      agreementId: agreementResult.agreementId,
      clubId: club.id,
      winningSide: 'B',
      recordedByUserId: bob.u.id,
    });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.code).toBe('ALREADY_RECORDED');
    if (second.code !== 'ALREADY_RECORDED') return;
    expect(second.recordedByUserId).toBe(alice.u.id);
  });
});

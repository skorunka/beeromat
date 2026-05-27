import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTestDb, type TestDb } from '../helpers/db';

let testDb: TestDb;

vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

import { onBehalfReviewSummaryForMember } from '@/lib/db/queries/on-behalf-review';

async function seedMember(
  label: string,
  clubId: string,
  avatar: {
    avatarKey?: string | null;
    avatarUploadAt?: Date | null;
  },
) {
  const { users } = await import('@/lib/db/schema/auth');
  const { members } = await import('@/lib/db/schema/members');

  const [user] = await testDb
    .insert(users)
    .values({
      email: `${label}-${Date.now()}-${Math.random()}@example.test`,
      name: label,
    })
    .returning();
  if (!user) throw new Error('seed user');

  const [member] = await testDb
    .insert(members)
    .values({
      clubId,
      userId: user.id,
      email: user.email,
      displayName: label,
      role: 'member',
      avatarKey: avatar.avatarKey ?? null,
      avatarUploadAt: avatar.avatarUploadAt ?? null,
    })
    .returning();
  if (!member) throw new Error('seed member');

  return { user, member };
}

describe('onBehalfReviewSummaryForMember — spec 026 logger avatar fields', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
  });

  it('projects loggerMemberId + loggerAvatarKey + loggerAvatarUploadAt on each row', async () => {
    const { clubs } = await import('@/lib/db/schema/clubs');
    const { beerTypes } = await import('@/lib/db/schema/catalog');
    const { drinkSessions } = await import('@/lib/db/schema/sessions');
    const { consumptions } = await import('@/lib/db/schema/consumption');

    const [club] = await testDb
      .insert(clubs)
      .values({ name: 'Test', currencyCode: 'CZK', defaultLocale: 'cs-CZ' })
      .returning();
    if (!club) throw new Error('seed club');

    // Consumer (whose tab is reviewed).
    const { user: consumerUser, member: consumer } = await seedMember(
      'consumer',
      club.id,
      {},
    );
    // Logger A: uploaded photo.
    const uploadedAt = new Date('2026-05-01T12:00:00Z');
    const { user: loggerAUser, member: loggerA } = await seedMember(
      'logger-a',
      club.id,
      { avatarUploadAt: uploadedAt },
    );
    // Logger B: glyph only.
    const { user: loggerBUser, member: loggerB } = await seedMember(
      'logger-b',
      club.id,
      { avatarKey: 'trophy' },
    );
    // Logger C: neither (initials fallback).
    const { user: loggerCUser, member: loggerC } = await seedMember(
      'logger-c',
      club.id,
      {},
    );

    const [beer] = await testDb
      .insert(beerTypes)
      .values({
        clubId: club.id,
        name: 'Pilsner',
        unitPriceMinor: 5000n,
        currentStock: 100,
        createdByUserId: consumerUser.id,
      })
      .returning();
    if (!beer) throw new Error('seed beer');

    const [session] = await testDb
      .insert(drinkSessions)
      .values({
        clubId: club.id,
        openedByUserId: consumerUser.id,
        startedAt: new Date(),
      })
      .returning();
    if (!session) throw new Error('seed session');

    // Three on-behalf logs on the consumer's tab, one per logger.
    for (const u of [loggerAUser, loggerBUser, loggerCUser]) {
      await testDb.insert(consumptions).values({
        clubId: club.id,
        drinkSessionId: session.id,
        memberId: consumer.id,
        beerTypeId: beer.id,
        unitPriceMinorSnapshot: 5000n,
        createdByUserId: u.id,
      });
    }

    const summary = await onBehalfReviewSummaryForMember(consumer.id, club.id);
    expect(summary.count).toBe(3);

    const byLogger = new Map(summary.rows.map((r) => [r.loggerDisplayName, r]));

    expect(byLogger.get('logger-a')?.loggerMemberId).toBe(loggerA.id);
    expect(byLogger.get('logger-a')?.loggerAvatarKey).toBeNull();
    expect(byLogger.get('logger-a')?.loggerAvatarUploadAt).toEqual(uploadedAt);

    expect(byLogger.get('logger-b')?.loggerMemberId).toBe(loggerB.id);
    expect(byLogger.get('logger-b')?.loggerAvatarKey).toBe('trophy');
    expect(byLogger.get('logger-b')?.loggerAvatarUploadAt).toBeNull();

    expect(byLogger.get('logger-c')?.loggerMemberId).toBe(loggerC.id);
    expect(byLogger.get('logger-c')?.loggerAvatarKey).toBeNull();
    expect(byLogger.get('logger-c')?.loggerAvatarUploadAt).toBeNull();
  });
});

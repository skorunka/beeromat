import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTestDb, type TestDb } from '../helpers/db';

let testDb: TestDb;

vi.mock('@/lib/db/client', () => ({
  get db() {
    return testDb;
  },
}));

import { getRecentlyConfirmedPayments } from '@/lib/db/queries/payments';

async function seedMember(label: string, clubId: string, avatar: {
  avatarKey?: string | null;
  avatarUploadAt?: Date | null;
}) {
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

async function seedConfirmedPayment(opts: {
  clubId: string;
  memberId: string;
  treasurerUserId: string;
  amount: bigint;
}) {
  const { payments, paymentStateTransitions } = await import(
    '@/lib/db/schema/payments'
  );
  const [p] = await testDb
    .insert(payments)
    .values({
      clubId: opts.clubId,
      memberId: opts.memberId,
      amountMinor: opts.amount,
      currencyCode: 'CZK',
      status: 'confirmed',
      origin: 'member_initiated',
      createdByUserId: opts.treasurerUserId,
    })
    .returning();
  if (!p) throw new Error('seed payment');
  await testDb.insert(paymentStateTransitions).values({
    clubId: opts.clubId,
    paymentId: p.id,
    fromStatus: 'claimed',
    toStatus: 'confirmed',
    createdByUserId: opts.treasurerUserId,
  });
  return p;
}

describe('getRecentlyConfirmedPayments — spec 023 avatar fields', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
  });

  it('projects memberId + memberAvatarKey + memberAvatarUploadAt on each confirmed row', async () => {
    const { clubs } = await import('@/lib/db/schema/clubs');
    const [club] = await testDb
      .insert(clubs)
      .values({ name: 'Test', currencyCode: 'CZK', defaultLocale: 'cs-CZ' })
      .returning();
    if (!club) throw new Error('seed club');

    const { user: treasurerUser } = await seedMember('treas', club.id, {});

    const uploadedAt = new Date('2026-05-01T12:00:00Z');
    const { member: m1 } = await seedMember('with-photo', club.id, {
      avatarUploadAt: uploadedAt,
    });
    const { member: m2 } = await seedMember('with-glyph', club.id, {
      avatarKey: 'trophy',
    });
    const { member: m3 } = await seedMember('plain', club.id, {});

    await seedConfirmedPayment({
      clubId: club.id,
      memberId: m1.id,
      treasurerUserId: treasurerUser.id,
      amount: 100n,
    });
    await seedConfirmedPayment({
      clubId: club.id,
      memberId: m2.id,
      treasurerUserId: treasurerUser.id,
      amount: 200n,
    });
    await seedConfirmedPayment({
      clubId: club.id,
      memberId: m3.id,
      treasurerUserId: treasurerUser.id,
      amount: 300n,
    });

    const rows = await getRecentlyConfirmedPayments(club.id);
    expect(rows).toHaveLength(3);

    const byName = new Map(rows.map((r) => [r.memberDisplayName, r]));
    expect(byName.get('with-photo')?.memberId).toBe(m1.id);
    expect(byName.get('with-photo')?.memberAvatarUploadAt).toEqual(uploadedAt);
    expect(byName.get('with-glyph')?.memberAvatarKey).toBe('trophy');
    expect(byName.get('plain')?.memberAvatarKey).toBeNull();
    expect(byName.get('plain')?.memberAvatarUploadAt).toBeNull();
  });
});

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
    member: { id: string; role: string } | null;
    club: { id: string };
  },
};

vi.mock('@/lib/auth/session', () => ({
  requireUnlocked: async () => ctxRef.current!,
}));

vi.mock('next/cache', () => ({
  revalidatePath: () => {},
}));

import { uploadAvatarAction } from '@/app/[locale]/(app)/account/actions';

async function seedClubAndMember() {
  const { users } = await import('@/lib/db/schema/auth');
  const { clubs } = await import('@/lib/db/schema/clubs');
  const { members } = await import('@/lib/db/schema/members');

  const [user] = await testDb
    .insert(users)
    .values({ email: `a-${Date.now()}-${Math.random()}@example.test`, name: 'Alice' })
    .returning();
  if (!user) throw new Error('seed user');

  const [club] = await testDb
    .insert(clubs)
    .values({ name: 'Test Club', currencyCode: 'CZK', defaultLocale: 'cs-CZ' })
    .returning();
  if (!club) throw new Error('seed club');

  const [member] = await testDb
    .insert(members)
    .values({
      clubId: club.id,
      userId: user.id,
      email: user.email,
      displayName: 'Alice',
      role: 'member',
    })
    .returning();
  if (!member) throw new Error('seed member');

  return { user, club, member };
}

async function readUpload(memberId: string) {
  const { avatarUploads } = await import('@/lib/db/schema/avatar-uploads');
  return testDb.query.avatarUploads.findFirst({
    where: eq(avatarUploads.memberId, memberId),
  });
}

async function readMemberAvatarUploadAt(memberId: string): Promise<Date | null> {
  const { members } = await import('@/lib/db/schema/members');
  const row = await testDb.query.members.findFirst({
    where: eq(members.id, memberId),
  });
  return row?.avatarUploadAt ?? null;
}

// Smallest valid JPEG (a single 1x1 white pixel) — enough bytes
// to be non-empty without dragging in a binary fixture file.
const TINY_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQBAQAAAAAAAAAAAAAAAAAAAAj/2gAMAwEAAhADEAAAAQH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAn//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AX//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AX//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/An//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IX//2Q==';

describe('uploadAvatarAction (spec 021)', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
    ctxRef.current = null;
  });

  it('happy first upload — inserts row + sets avatar_upload_at', async () => {
    const { user, club, member } = await seedClubAndMember();
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'member' },
      club: { id: club.id },
    };

    const result = await uploadAvatarAction({
      imageBase64: TINY_JPEG_BASE64,
      contentType: 'image/jpeg',
    });

    expect(result).toEqual({ ok: true });
    const row = await readUpload(member.id);
    expect(row).toBeTruthy();
    expect(row?.contentType).toBe('image/jpeg');
    expect(row?.byteSize).toBeGreaterThan(0);
    expect(await readMemberAvatarUploadAt(member.id)).toBeInstanceOf(Date);
  });

  it('replace upload — same member, second call updates existing row', async () => {
    const { user, club, member } = await seedClubAndMember();
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'member' },
      club: { id: club.id },
    };
    await uploadAvatarAction({
      imageBase64: TINY_JPEG_BASE64,
      contentType: 'image/jpeg',
    });
    const first = await readUpload(member.id);

    // Tiny pause so updated_at advances.
    await new Promise((r) => setTimeout(r, 10));

    const result = await uploadAvatarAction({
      imageBase64: TINY_JPEG_BASE64,
      contentType: 'image/png',
    });

    expect(result).toEqual({ ok: true });
    const second = await readUpload(member.id);
    expect(second?.id).toBe(first?.id); // same row, UPSERT
    expect(second?.contentType).toBe('image/png');
    expect(second!.updatedAt.getTime()).toBeGreaterThan(first!.updatedAt.getTime());
  });

  it('invalid content type rejected', async () => {
    const { user, club, member } = await seedClubAndMember();
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'member' },
      club: { id: club.id },
    };

    const result = await uploadAvatarAction({
      imageBase64: TINY_JPEG_BASE64,
      contentType: 'application/pdf',
    });

    expect(result).toEqual({ ok: false, code: 'INVALID_CONTENT_TYPE' });
    expect(await readUpload(member.id)).toBeUndefined();
  });

  it('oversize rejected (>256 KB)', async () => {
    const { user, club, member } = await seedClubAndMember();
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'member' },
      club: { id: club.id },
    };
    // 300 KB of zero bytes, base64-encoded.
    const big = Buffer.alloc(300 * 1024).toString('base64');

    const result = await uploadAvatarAction({
      imageBase64: big,
      contentType: 'image/jpeg',
    });

    expect(result).toEqual({ ok: false, code: 'OVERSIZE' });
    expect(await readUpload(member.id)).toBeUndefined();
  });

  it('empty image rejected', async () => {
    const { user, club, member } = await seedClubAndMember();
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'member' },
      club: { id: club.id },
    };

    const result = await uploadAvatarAction({
      imageBase64: '',
      contentType: 'image/jpeg',
    });

    expect(result).toEqual({ ok: false, code: 'EMPTY_IMAGE' });
  });

  it('no membership rejected', async () => {
    const { user, club } = await seedClubAndMember();
    ctxRef.current = {
      user: { id: user.id },
      member: null,
      club: { id: club.id },
    };

    const result = await uploadAvatarAction({
      imageBase64: TINY_JPEG_BASE64,
      contentType: 'image/jpeg',
    });

    expect(result).toEqual({ ok: false, code: 'NO_MEMBERSHIP' });
  });
});

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

import {
  activateAvatarUploadAction,
  removeAvatarUploadAction,
  setAvatarAction,
  uploadAvatarAction,
} from '@/app/[locale]/(app)/account/actions';

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

async function uploadCount(memberId: string): Promise<number> {
  const { avatarUploads } = await import('@/lib/db/schema/avatar-uploads');
  const rows = await testDb
    .select()
    .from(avatarUploads)
    .where(eq(avatarUploads.memberId, memberId));
  return rows.length;
}

async function readMemberRow(memberId: string) {
  const { members } = await import('@/lib/db/schema/members');
  return testDb.query.members.findFirst({ where: eq(members.id, memberId) });
}

const TINY_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQBAQAAAAAAAAAAAAAAAAAAAAj/2gAMAwEAAhADEAAAAQH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAn//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AX//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AX//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/An//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IX//2Q==';

describe('removeAvatarUploadAction + setAvatarAction clears upload (spec 021)', () => {
  beforeEach(async () => {
    ({ db: testDb } = await makeTestDb());
    ctxRef.current = null;
  });

  it('happy remove — drops upload row + clears avatar_upload_at', async () => {
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
    expect(await uploadCount(member.id)).toBe(1);

    const result = await removeAvatarUploadAction();

    expect(result).toEqual({ ok: true });
    expect(await uploadCount(member.id)).toBe(0);
    expect((await readMemberRow(member.id))?.avatarUploadAt).toBeNull();
  });

  it('no-op remove when nothing to remove', async () => {
    const { user, club, member } = await seedClubAndMember();
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'member' },
      club: { id: club.id },
    };

    const result = await removeAvatarUploadAction();

    expect(result).toEqual({ ok: true });
    expect(await uploadCount(member.id)).toBe(0);
    expect((await readMemberRow(member.id))?.avatarUploadAt).toBeNull();
  });

  it('picking a glyph DEACTIVATES upload but KEEPS bytes (spec 021 fix)', async () => {
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
    expect(await uploadCount(member.id)).toBe(1);

    const result = await setAvatarAction({ avatarKey: 'star' });

    expect(result).toEqual({ ok: true });
    // Bytes ARE retained — member can switch back without re-upload.
    expect(await uploadCount(member.id)).toBe(1);
    const row = await readMemberRow(member.id);
    expect(row?.avatarKey).toBe('star');
    // But the renderer sentinel is cleared so the glyph wins.
    expect(row?.avatarUploadAt).toBeNull();
  });

  it('activate reactivates a deactivated upload without re-uploading', async () => {
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
    // Glyph pick deactivates the upload (avatarUploadAt = null) but
    // bytes stay.
    await setAvatarAction({ avatarKey: 'star' });
    expect((await readMemberRow(member.id))?.avatarUploadAt).toBeNull();
    expect(await uploadCount(member.id)).toBe(1);

    const result = await activateAvatarUploadAction();

    expect(result).toEqual({ ok: true, activated: true });
    const row = await readMemberRow(member.id);
    expect(row?.avatarUploadAt).toBeInstanceOf(Date);
    // Glyph key is preserved — when the upload is removed later,
    // the renderer falls back to the previously-picked glyph.
    expect(row?.avatarKey).toBe('star');
  });

  it('activate is a safe no-op when no stored bytes exist', async () => {
    const { user, club, member } = await seedClubAndMember();
    ctxRef.current = {
      user: { id: user.id },
      member: { id: member.id, role: 'member' },
      club: { id: club.id },
    };

    const result = await activateAvatarUploadAction();

    expect(result).toEqual({ ok: true, activated: false });
    expect((await readMemberRow(member.id))?.avatarUploadAt).toBeNull();
  });

  it('cascade on member delete — drops upload row', async () => {
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
    expect(await uploadCount(member.id)).toBe(1);

    const { members } = await import('@/lib/db/schema/members');
    await testDb.delete(members).where(eq(members.id, member.id));

    expect(await uploadCount(member.id)).toBe(0);
  });
});

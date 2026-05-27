import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { avatarUploads } from '@/lib/db/schema/avatar-uploads';
import { members } from '@/lib/db/schema/members';
import { requireUnlocked } from '@/lib/auth/session';

// Spec 021 — serves the stored avatar image bytes for a member.
// See specs/021-avatar-upload/contracts/avatar-route.md.
//
// Cross-club isolation returns 404 (NOT 403) to avoid leaking
// membership information by error code. The version query param
// (?v=...) is the cache-buster passed by the renderer — handler
// ignores its value, it's purely browser cache key shaping.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ memberId: string }> },
) {
  const { memberId } = await params;
  if (!UUID_RE.test(memberId)) {
    return new NextResponse(null, { status: 404 });
  }

  const ctx = await requireUnlocked();

  // Single join: only return bytes if the member belongs to the
  // caller's current club. Cross-club requests fall through to 404.
  const [row] = await db
    .select({
      image: avatarUploads.image,
      contentType: avatarUploads.contentType,
    })
    .from(avatarUploads)
    .innerJoin(members, eq(members.id, avatarUploads.memberId))
    .where(and(eq(avatarUploads.memberId, memberId), eq(members.clubId, ctx.club.id)))
    .limit(1);

  if (!row) {
    return new NextResponse(null, { status: 404 });
  }

  // ArrayBuffer view of the Uint8Array — Next 16 / fetch.Response
  // accepts both, but ArrayBuffer is the canonical NextResponse body
  // for binary.
  const buffer = row.image instanceof Uint8Array ? row.image : new Uint8Array(row.image);
  return new NextResponse(buffer as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': row.contentType,
      'Content-Length': String(buffer.byteLength),
      'Cache-Control': 'public, max-age=3600, immutable',
    },
  });
}

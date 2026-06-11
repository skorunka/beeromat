import { NextResponse } from 'next/server';

import { ensureOccurrences } from '@/lib/db/queries/events';

// Spec 032 — nightly occurrence generation. Triggered by Vercel Cron (see
// vercel.json), which sends `Authorization: Bearer $CRON_SECRET`. The route
// is public (not user-authenticated), so the secret is the only gate.
// Generation is idempotent — a missed/late/double run is harmless.
export const dynamic = 'force-dynamic';

async function handle(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const created = await ensureOccurrences(new Date());
  return NextResponse.json({ ok: true, created });
}

export const GET = handle;
export const POST = handle;

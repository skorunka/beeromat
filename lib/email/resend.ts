import 'server-only';
import { Resend } from 'resend';

import { env } from '@/lib/env';
import { InvitationEmail } from '@/emails/InvitationEmail';
import { MagicLinkEmail } from '@/emails/MagicLinkEmail';

// Lazy Resend client. Same rationale as lib/db/client.ts — the Resend
// constructor throws on a missing API key, which would otherwise break
// `next build` when env vars aren't available (e.g. in CI dry-builds).
let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) _resend = new Resend(env.RESEND_API_KEY);
  return _resend;
}

export async function sendMagicLink({ to, url }: { to: string; url: string }): Promise<void> {
  await getResend().emails.send({
    from: env.EMAIL_FROM,
    to,
    subject: 'Your beeromat sign-in link',
    react: MagicLinkEmail({ url }),
  });
}

export async function sendInvitation({
  to,
  inviterName,
  clubName,
  url,
}: {
  to: string;
  inviterName: string;
  clubName: string;
  url: string;
}): Promise<void> {
  await getResend().emails.send({
    from: env.EMAIL_FROM,
    to,
    subject: `${inviterName} invited you to ${clubName} on beeromat`,
    react: InvitationEmail({ inviterName, clubName, url }),
  });
}

import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';
import { render } from '@react-email/render';

import { env } from '@/lib/env';
import { InvitationEmail } from '@/emails/InvitationEmail';
import { MagicLinkEmail } from '@/emails/MagicLinkEmail';

// Transactional email over SMTP. One code path for every environment;
// only SMTP_URL changes (constitution v1.3.0 — configuration not code):
//   - local dev + E2E → smtp://localhost:11025 (the Mailpit container)
//   - production       → Resend's SMTP gateway (smtps://resend:KEY@…)
//
// Lazy transporter — mirrors lib/db/client.ts: nothing connects at
// import time, so `next build` works without a reachable SMTP server.
let _transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!_transporter) _transporter = nodemailer.createTransport(env.SMTP_URL);
  return _transporter;
}

async function sendEmail(args: {
  to: string;
  subject: string;
  body: React.ReactElement;
}): Promise<void> {
  const [html, text] = await Promise.all([
    render(args.body),
    render(args.body, { plainText: true }),
  ]);
  try {
    await getTransporter().sendMail({
      from: env.EMAIL_FROM,
      to: args.to,
      subject: args.subject,
      html,
      text,
    });
  } catch (err) {
    // Best-effort: a failed send must never break the surrounding flow.
    // The verification / invitation row is already persisted, so the
    // recipient can be re-sent the link. Surfaces in logs for ops.
    console.error('[email] send failed:', err);
  }
}

export async function sendMagicLink({ to, url }: { to: string; url: string }): Promise<void> {
  await sendEmail({
    to,
    subject: 'Your beeromat sign-in link',
    body: MagicLinkEmail({ url }),
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
  await sendEmail({
    to,
    subject: `${inviterName} invited you to ${clubName} on beeromat`,
    body: InvitationEmail({ inviterName, clubName, url }),
  });
}

import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';
import { render } from '@react-email/render';
import { getTranslations } from 'next-intl/server';

import { env } from '@/lib/env';
import { InvitationEmail } from '@/emails/InvitationEmail';
import { MagicLinkEmail } from '@/emails/MagicLinkEmail';
import { routing, type Locale } from '@/lib/i18n/routing';

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

// Spec 007 FR-003 / FR-008: callers pass the recipient's resolved
// request locale; an omitted or unrecognized value falls back to
// routing.defaultLocale rather than throwing. Locale-resolution
// failure (e.g. getTranslations races, catalog missing) MUST NOT
// block the email send — log and use the default.
function normalizeLocale(locale: string | undefined): Locale {
  const candidate = (locale ?? '').toLowerCase().split('-')[0] ?? '';
  return (routing.locales as readonly string[]).includes(candidate)
    ? (candidate as Locale)
    : routing.defaultLocale;
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

export async function sendMagicLink({
  to,
  url,
  locale,
}: {
  to: string;
  url: string;
  locale?: Locale;
}): Promise<void> {
  const resolved = normalizeLocale(locale);
  let t: Awaited<ReturnType<typeof getTranslations>>;
  try {
    t = await getTranslations({ locale: resolved, namespace: 'emails.magicLink' });
  } catch (err) {
    console.warn('[email] magic-link locale resolution failed; falling back', err);
    t = await getTranslations({
      locale: routing.defaultLocale,
      namespace: 'emails.magicLink',
    });
  }
  await sendEmail({
    to,
    subject: t('subject'),
    body: MagicLinkEmail({
      url,
      previewText: t('previewText'),
      heading: t('heading'),
      bodyParagraph: t('bodyParagraph'),
      buttonLabel: t('buttonLabel'),
      fallbackLinkLabel: t('fallbackLinkLabel'),
      signoffParagraph: t('signoffParagraph'),
    }),
  });
}

export async function sendInvitation({
  to,
  inviterName,
  clubName,
  url,
  locale,
}: {
  to: string;
  inviterName: string;
  clubName: string;
  url: string;
  locale?: Locale;
}): Promise<void> {
  const resolved = normalizeLocale(locale);
  let t: Awaited<ReturnType<typeof getTranslations>>;
  try {
    t = await getTranslations({ locale: resolved, namespace: 'emails.invitation' });
  } catch (err) {
    console.warn('[email] invitation locale resolution failed; falling back', err);
    t = await getTranslations({
      locale: routing.defaultLocale,
      namespace: 'emails.invitation',
    });
  }
  await sendEmail({
    to,
    subject: t('subject', { inviterName, clubName }),
    body: InvitationEmail({
      url,
      previewText: t('previewText'),
      heading: t('heading', { clubName }),
      bodyIntro: t('bodyIntro', { inviterName, clubName }),
      bodyPitch: t('bodyPitch'),
      buttonLabel: t('buttonLabel'),
      fallbackLinkLabel: t('fallbackLinkLabel'),
      expiryNote: t('expiryNote'),
      ignoreNote: t('ignoreNote', { inviterName }),
    }),
  });
}

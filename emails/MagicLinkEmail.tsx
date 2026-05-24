import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';

// Pure-prop component (spec 007 FR-002). React Email components render
// outside next-intl's React tree, so they can't call useTranslations.
// The mailer (lib/email/mailer.ts) pre-resolves the locale-bound
// strings via getTranslations({ locale, namespace: 'emails.magicLink' })
// and hands them in as props. The template is presentation only.
interface MagicLinkEmailProps {
  url: string;
  previewText: string;
  heading: string;
  bodyParagraph: string;
  buttonLabel: string;
  fallbackLinkLabel: string;
  signoffParagraph: string;
}

export function MagicLinkEmail({
  url,
  previewText,
  heading: headingText,
  bodyParagraph,
  buttonLabel,
  fallbackLinkLabel,
  signoffParagraph,
}: MagicLinkEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>{headingText}</Heading>
          <Text style={paragraph}>{bodyParagraph}</Text>
          <Section style={buttonSection}>
            <Button href={url} style={button}>
              {buttonLabel}
            </Button>
          </Section>
          <Text style={small}>
            {fallbackLinkLabel}
            <br />
            <span style={mono}>{url}</span>
          </Text>
          <Text style={small}>{signoffParagraph}</Text>
        </Container>
      </Body>
    </Html>
  );
}

// PreviewProps so React Email's `pnpm email` preview server still
// renders this in isolation with sample copy.
MagicLinkEmail.PreviewProps = {
  url: 'https://beeromat.example.com/api/auth/magic-link/callback?token=abc123',
  previewText: 'Link valid for 5 minutes.',
  heading: 'Sign in to beeromat',
  bodyParagraph:
    'Tap the button to sign in. The link is valid for 5 minutes and can only be used once.',
  buttonLabel: 'Sign in',
  fallbackLinkLabel: 'Or paste this link into your browser:',
  signoffParagraph:
    "If you didn't request this, you can safely ignore this email — nothing will happen.",
} satisfies MagicLinkEmailProps;

export default MagicLinkEmail;

// Clubhouse palette — hardcoded literals (CSS vars don't resolve in
// most email clients). Mirrors app/globals.css :root tokens.
const body = { backgroundColor: '#f6eedd', fontFamily: 'system-ui, sans-serif', margin: 0 };
const container = {
  backgroundColor: '#fffbf3',
  border: '1px solid #e4d7be',
  borderRadius: '14px',
  margin: '40px auto',
  maxWidth: '480px',
  padding: '40px 32px',
};
const heading = { color: '#2c2114', fontSize: '24px', fontWeight: 600, marginTop: 0 };
const paragraph = { color: '#2c2114', fontSize: '16px', lineHeight: '24px' };
const buttonSection = { margin: '32px 0' };
const button = {
  backgroundColor: '#8a5214',
  borderRadius: '8px',
  color: '#fffbf3',
  display: 'inline-block',
  fontSize: '16px',
  fontWeight: 600,
  padding: '12px 24px',
  textDecoration: 'none',
};
const small = { color: '#6e5e48', fontSize: '13px', lineHeight: '20px' };
const mono = { fontFamily: 'monospace', wordBreak: 'break-all' as const };

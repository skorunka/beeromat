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
// strings — including the {inviterName} / {clubName} interpolations —
// via getTranslations({ locale, namespace: 'emails.invitation' }) and
// hands the already-interpolated strings in as props. The template is
// presentation only.
interface InvitationEmailProps {
  url: string;
  previewText: string;
  heading: string;
  bodyIntro: string;
  bodyPitch: string;
  buttonLabel: string;
  fallbackLinkLabel: string;
  expiryNote: string;
  ignoreNote: string;
}

export function InvitationEmail({
  url,
  previewText,
  heading: headingText,
  bodyIntro,
  bodyPitch,
  buttonLabel,
  fallbackLinkLabel,
  expiryNote,
  ignoreNote,
}: InvitationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>{headingText}</Heading>
          <Text style={paragraph}>{bodyIntro}</Text>
          <Text style={paragraph}>{bodyPitch}</Text>
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
          <Text style={small}>
            {expiryNote} {ignoreNote}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

// PreviewProps so React Email's `pnpm email` preview server still
// renders this in isolation with sample copy.
InvitationEmail.PreviewProps = {
  url: 'https://beeromat.example.com/invitation/abc123',
  previewText: 'Join the crew on beeromat.',
  heading: 'Welcome to TK Slávia Praha',
  bodyIntro:
    'Hey! Pavel Novák invited you to TK Slávia Praha on beeromat — the app the club uses to keep tabs on after-match beers.',
  bodyPitch: 'Tap the button to set up your profile and join in.',
  buttonLabel: 'Accept invitation',
  fallbackLinkLabel: 'Or paste this link into your browser:',
  expiryNote: 'Invitation valid for 14 days.',
  ignoreNote: "If you don't recognise Pavel Novák, you can safely ignore this email.",
} satisfies InvitationEmailProps;

export default InvitationEmail;

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

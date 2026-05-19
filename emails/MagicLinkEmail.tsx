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

interface MagicLinkEmailProps {
  url: string;
}

export function MagicLinkEmail({ url }: MagicLinkEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your beeromat sign-in link (valid for 5 minutes)</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>Sign in to beeromat</Heading>
          <Text style={paragraph}>
            Tap the button below to sign in. This link is valid for 5 minutes and can only be used
            once.
          </Text>
          <Section style={buttonSection}>
            <Button href={url} style={button}>
              Sign in
            </Button>
          </Section>
          <Text style={small}>
            Or paste this link into your browser:
            <br />
            <span style={mono}>{url}</span>
          </Text>
          <Text style={small}>
            If you didn&apos;t request this, you can ignore this email — nothing will happen.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

MagicLinkEmail.PreviewProps = {
  url: 'https://beeromat.example.com/api/auth/magic-link/callback?token=abc123',
} satisfies MagicLinkEmailProps;

export default MagicLinkEmail;

const body = { backgroundColor: '#f6f6f6', fontFamily: 'system-ui, sans-serif', margin: 0 };
const container = {
  backgroundColor: '#ffffff',
  border: '1px solid #e0e0e0',
  borderRadius: '8px',
  margin: '40px auto',
  maxWidth: '480px',
  padding: '40px 32px',
};
const heading = { color: '#0f172a', fontSize: '24px', fontWeight: 600, marginTop: 0 };
const paragraph = { color: '#334155', fontSize: '16px', lineHeight: '24px' };
const buttonSection = { margin: '32px 0' };
const button = {
  backgroundColor: '#0f172a',
  borderRadius: '6px',
  color: '#ffffff',
  display: 'inline-block',
  fontSize: '16px',
  fontWeight: 600,
  padding: '12px 24px',
  textDecoration: 'none',
};
const small = { color: '#64748b', fontSize: '13px', lineHeight: '20px' };
const mono = { fontFamily: 'monospace', wordBreak: 'break-all' as const };

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

interface InvitationEmailProps {
  inviterName: string;
  clubName: string;
  url: string;
}

export function InvitationEmail({ inviterName, clubName, url }: InvitationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        {inviterName} invited you to {clubName} on beeromat
      </Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>You&apos;re invited to {clubName}</Heading>
          <Text style={paragraph}>
            <strong>{inviterName}</strong> has invited you to use <em>beeromat</em> — the
            after-match beer tab tracker for {clubName}.
          </Text>
          <Text style={paragraph}>
            beeromat helps the club track who drank what, settle bets, and pay the treasurer with
            zero mental math. Tap the button to set up your account.
          </Text>
          <Section style={buttonSection}>
            <Button href={url} style={button}>
              Accept invitation
            </Button>
          </Section>
          <Text style={small}>
            Or paste this link into your browser:
            <br />
            <span style={mono}>{url}</span>
          </Text>
          <Text style={small}>
            This invitation is valid for 14 days. If you don&apos;t recognise {inviterName}, you can
            safely ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

InvitationEmail.PreviewProps = {
  inviterName: 'Pavel Novák',
  clubName: 'TK Slávia Praha',
  url: 'https://beeromat.example.com/invitation/abc123',
} satisfies InvitationEmailProps;

export default InvitationEmail;

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

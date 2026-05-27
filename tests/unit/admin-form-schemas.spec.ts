import { describe, expect, it } from 'vitest';

import { signInSchema, pinUnlockSchema, pinSetupSchema } from '@/lib/validation/auth';
import { acceptInvitationSchema } from '@/lib/validation/invitation';
import { inviteMemberSchema } from '@/lib/validation/members';
import { adjustSchema, restockSchema } from '@/lib/validation/stock';

// More form-side schemas: stock manager forms (restock + adjust),
// member invite / invitation accept, auth (sign-in + PIN).

describe('restockSchema', () => {
  it('happy path — positive whole quantity', () => {
    const r = restockSchema.safeParse({ quantity: '24', reason: 'delivery' });
    expect(r.success).toBe(true);
  });

  it('rejects zero quantity', () => {
    const r = restockSchema.safeParse({ quantity: '0', reason: '' });
    expect(r.success).toBe(false);
  });

  it('rejects fractional quantity', () => {
    const r = restockSchema.safeParse({ quantity: '24.5', reason: '' });
    expect(r.success).toBe(false);
  });

  it('accepts empty reason (restock note is optional)', () => {
    const r = restockSchema.safeParse({ quantity: '24', reason: '' });
    expect(r.success).toBe(true);
  });

  it('rejects reason over 500 chars', () => {
    const r = restockSchema.safeParse({
      quantity: '1',
      reason: 'x'.repeat(501),
    });
    expect(r.success).toBe(false);
  });
});

describe('adjustSchema', () => {
  it('happy path — add mode with quantity + reason', () => {
    const r = adjustSchema.safeParse({
      quantity: '5',
      mode: 'add',
      reason: 'recount',
    });
    expect(r.success).toBe(true);
  });

  it('happy path — remove mode with quantity + reason', () => {
    const r = adjustSchema.safeParse({
      quantity: '5',
      mode: 'remove',
      reason: 'spillage',
    });
    expect(r.success).toBe(true);
  });

  it('reason is mandatory (treasurer audit context)', () => {
    const r = adjustSchema.safeParse({
      quantity: '5',
      mode: 'add',
      reason: '',
    });
    expect(r.success).toBe(false);
  });

  it('rejects invalid mode', () => {
    const r = adjustSchema.safeParse({
      quantity: '5',
      mode: 'subtract',
      reason: 'x',
    });
    expect(r.success).toBe(false);
  });
});

describe('inviteMemberSchema', () => {
  it('happy path — email + role', () => {
    const r = inviteMemberSchema.safeParse({
      email: 'alice@example.com',
      role: 'member',
    });
    expect(r.success).toBe(true);
  });

  it('lowercase the email at the server-action layer; schema only checks structure', () => {
    const r = inviteMemberSchema.safeParse({
      email: 'Alice@Example.com',
      role: 'member',
    });
    expect(r.success).toBe(true);
  });

  it('rejects missing @', () => {
    const r = inviteMemberSchema.safeParse({
      email: 'aliceexample.com',
      role: 'member',
    });
    expect(r.success).toBe(false);
  });

  it('rejects invalid role', () => {
    const r = inviteMemberSchema.safeParse({
      email: 'alice@example.com',
      role: 'superuser',
    });
    expect(r.success).toBe(false);
  });

  it('all four club roles are accepted', () => {
    for (const role of ['member', 'stock_manager', 'treasurer', 'club_admin']) {
      const r = inviteMemberSchema.safeParse({
        email: 'a@b.com',
        role,
      });
      expect(r.success).toBe(true);
    }
  });
});

describe('acceptInvitationSchema', () => {
  it('happy path — non-empty display name', () => {
    const r = acceptInvitationSchema.safeParse({ displayName: 'Jan' });
    expect(r.success).toBe(true);
  });

  it('rejects empty / whitespace-only display name', () => {
    const empty = acceptInvitationSchema.safeParse({ displayName: '' });
    const ws = acceptInvitationSchema.safeParse({ displayName: '   ' });
    expect(empty.success).toBe(false);
    expect(ws.success).toBe(false);
  });

  it('rejects display name over 80 chars', () => {
    const r = acceptInvitationSchema.safeParse({
      displayName: 'x'.repeat(81),
    });
    expect(r.success).toBe(false);
  });
});

describe('signInSchema', () => {
  it('happy path — valid email', () => {
    const r = signInSchema.safeParse({ email: 'alice@example.com' });
    expect(r.success).toBe(true);
  });

  it('rejects malformed email', () => {
    const r = signInSchema.safeParse({ email: 'not-an-email' });
    expect(r.success).toBe(false);
  });
});

describe('pinUnlockSchema + pinSetupSchema', () => {
  it('unlock accepts exactly 4 digits', () => {
    expect(pinUnlockSchema.safeParse({ pin: '1234' }).success).toBe(true);
  });

  it('unlock rejects 3 or 5 digits', () => {
    expect(pinUnlockSchema.safeParse({ pin: '123' }).success).toBe(false);
    expect(pinUnlockSchema.safeParse({ pin: '12345' }).success).toBe(false);
  });

  it('unlock rejects non-digit chars', () => {
    expect(pinUnlockSchema.safeParse({ pin: '12a4' }).success).toBe(false);
  });

  it('setup requires matching pin + confirm with mismatch attached to confirmPin path', () => {
    const match = pinSetupSchema.safeParse({ pin: '1234', confirmPin: '1234' });
    expect(match.success).toBe(true);

    const mismatch = pinSetupSchema.safeParse({ pin: '1234', confirmPin: '5678' });
    expect(mismatch.success).toBe(false);
    if (mismatch.success) return;
    const issue = mismatch.error.issues.find((i) => i.path[0] === 'confirmPin');
    expect(issue?.message).toBe('pin.setup.mismatch');
  });
});

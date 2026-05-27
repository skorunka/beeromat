import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';

import { InviteForm } from '@/components/admin/invite-form';
import csMessages from '@/messages/cs.json';

const mockToastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: vi.fn(),
  },
}));

const mockInvite = vi.fn();
vi.mock('@/app/[locale]/(app)/admin/members/actions', () => ({
  inviteMemberAction: (...args: unknown[]) => mockInvite(...args),
}));

function renderForm() {
  return render(
    <NextIntlClientProvider locale="cs" messages={csMessages}>
      <InviteForm />
    </NextIntlClientProvider>,
  );
}

describe('InviteForm', () => {
  beforeEach(() => {
    mockToastSuccess.mockReset();
    mockInvite.mockReset();
  });

  it('happy path — submits email + default role and resets the email field', async () => {
    mockInvite.mockResolvedValue({ ok: true, invitationId: 'inv-1' });
    renderForm();
    const emailInput = screen.getByRole('textbox');
    fireEvent.change(emailInput, { target: { value: 'alice@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: csMessages.admin.sendInvitation }));
    await waitFor(() => {
      expect(mockInvite).toHaveBeenCalledWith({
        email: 'alice@example.com',
        role: 'member',
      });
      expect(mockToastSuccess).toHaveBeenCalled();
    });
    // Email field cleared.
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('');
  });

  it('malformed email fails the schema; action never called', async () => {
    mockInvite.mockResolvedValue({ ok: true });
    renderForm();
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'not-an-email' },
    });
    fireEvent.click(screen.getByRole('button', { name: csMessages.admin.sendInvitation }));
    await waitFor(() => {
      expect(mockInvite).not.toHaveBeenCalled();
    });
  });

  it('ALREADY_MEMBER surfaces the alreadyMember error on the email field', async () => {
    mockInvite.mockResolvedValue({ ok: false, code: 'ALREADY_MEMBER' });
    renderForm();
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'alice@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: csMessages.admin.sendInvitation }));
    await waitFor(() => {
      expect(mockInvite).toHaveBeenCalled();
      expect(screen.getByText(csMessages.admin.alreadyMember)).toBeInTheDocument();
    });
  });

  it('ALREADY_INVITED surfaces the alreadyInvited error on the email field', async () => {
    mockInvite.mockResolvedValue({ ok: false, code: 'ALREADY_INVITED' });
    renderForm();
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'alice@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: csMessages.admin.sendInvitation }));
    await waitFor(() => {
      expect(screen.getByText(csMessages.admin.alreadyInvited)).toBeInTheDocument();
    });
  });

  it('EMAIL_SEND_FAILED falls through to the root inviteFailed error', async () => {
    mockInvite.mockResolvedValue({ ok: false, code: 'EMAIL_SEND_FAILED' });
    renderForm();
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'alice@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: csMessages.admin.sendInvitation }));
    await waitFor(() => {
      expect(screen.getByText(csMessages.admin.inviteFailed)).toBeInTheDocument();
    });
  });
});

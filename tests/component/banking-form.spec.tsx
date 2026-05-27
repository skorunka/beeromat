import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';

import { BankingForm } from '@/components/admin/banking-form';
import csMessages from '@/messages/cs.json';

const mockToastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: vi.fn(),
  },
}));

const mockUpdate = vi.fn();
vi.mock('@/app/[locale]/(app)/admin/settings/actions', () => ({
  updateBankingProfileAction: (...args: unknown[]) => mockUpdate(...args),
}));

const VALID_IBAN = 'CZ6508000000192000145399';

function renderForm(initial: Partial<Parameters<typeof BankingForm>[0]['initial']> = {}) {
  return render(
    <NextIntlClientProvider locale="cs" messages={csMessages}>
      <BankingForm
        initial={{
          iban: null,
          accountHolderName: null,
          revolutHandle: null,
          defaultQrMessage: null,
          ...initial,
        }}
      />
    </NextIntlClientProvider>,
  );
}

describe('BankingForm', () => {
  beforeEach(() => {
    mockToastSuccess.mockReset();
    mockUpdate.mockReset();
  });

  it('happy path — every field empty → action receives nulls (clears profile)', async () => {
    mockUpdate.mockResolvedValue({ ok: true });
    renderForm();
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({
        iban: null,
        accountHolderName: null,
        revolutHandle: null,
        defaultQrMessage: null,
      });
      expect(mockToastSuccess).toHaveBeenCalled();
    });
  });

  it('whitespace-only values are normalised to null (clears the field)', async () => {
    mockUpdate.mockResolvedValue({ ok: true });
    renderForm({ accountHolderName: '   ' });
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ accountHolderName: null }),
      );
    });
  });

  it('happy path — populated initial values are sent back trimmed', async () => {
    mockUpdate.mockResolvedValue({ ok: true });
    renderForm({
      iban: VALID_IBAN,
      accountHolderName: '  TC Test  ',
      revolutHandle: '@johndoe',
      defaultQrMessage: 'beeromat',
    });
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({
        iban: VALID_IBAN,
        accountHolderName: 'TC Test',
        revolutHandle: '@johndoe',
        defaultQrMessage: 'beeromat',
      });
    });
  });

  it('valid-shape but bad-checksum IBAN is caught client-side; action not called', async () => {
    mockUpdate.mockResolvedValue({ ok: true });
    renderForm({ iban: 'CZ0008000000192000145399' });
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  it('server INVALID_IBAN result surfaces the invalidIban error on the iban field', async () => {
    mockUpdate.mockResolvedValue({ ok: false, code: 'INVALID_IBAN' });
    renderForm({ iban: VALID_IBAN });
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalled();
      expect(screen.getByText(csMessages.admin.invalidIban)).toBeInTheDocument();
    });
  });
});

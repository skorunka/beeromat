import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';

import { ManualPaymentForm } from '@/components/treasurer/manual-payment-form';
import csMessages from '@/messages/cs.json';

const mockRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh, push: vi.fn(), replace: vi.fn() }),
}));

const mockToastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: vi.fn(),
  },
}));

const mockRecord = vi.fn();
vi.mock('@/app/[locale]/(app)/admin/balances/actions', () => ({
  recordManualPaymentAction: (...args: unknown[]) => mockRecord(...args),
}));

function renderForm() {
  return render(
    <NextIntlClientProvider locale="cs" messages={csMessages}>
      <ManualPaymentForm memberId="member-abc" currencyCode="CZK" />
    </NextIntlClientProvider>,
  );
}

describe('ManualPaymentForm', () => {
  beforeEach(() => {
    mockRefresh.mockReset();
    mockToastSuccess.mockReset();
    mockRecord.mockReset();
  });

  it('happy path — submit with comma amount + note dispatches the action and resets the form', async () => {
    mockRecord.mockResolvedValue({ ok: true });
    renderForm();
    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0]!, { target: { value: '120,50' } });
    fireEvent.change(inputs[1]!, { target: { value: 'cash' } });
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(mockRecord).toHaveBeenCalledWith({
        memberId: 'member-abc',
        amountMinor: '12050',
        note: 'cash',
      });
      expect(mockToastSuccess).toHaveBeenCalled();
      expect(mockRefresh).toHaveBeenCalled();
    });
    // Form was reset — amount input is empty.
    const inputsAfter = screen.getAllByRole('textbox');
    expect((inputsAfter[0]! as HTMLInputElement).value).toBe('');
  });

  it('empty note becomes undefined (not empty string) in the action payload', async () => {
    mockRecord.mockResolvedValue({ ok: true });
    renderForm();
    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0]!, { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(mockRecord).toHaveBeenCalledWith({
        memberId: 'member-abc',
        amountMinor: '12000',
        note: undefined,
      });
    });
  });

  it('zero amount fails the Zod refine and never reaches the action', async () => {
    mockRecord.mockResolvedValue({ ok: true });
    renderForm();
    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0]!, { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(mockRecord).not.toHaveBeenCalled();
    });
  });

  it('non-numeric amount fails the schema and never reaches the action', async () => {
    mockRecord.mockResolvedValue({ ok: true });
    renderForm();
    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0]!, { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(mockRecord).not.toHaveBeenCalled();
    });
  });

  it('NOT_FOUND result surfaces the manualMemberNotFound root error key', async () => {
    mockRecord.mockResolvedValue({ ok: false, code: 'NOT_FOUND' });
    renderForm();
    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0]!, { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(mockRecord).toHaveBeenCalled();
      expect(mockRefresh).not.toHaveBeenCalled();
      // FormRootError renders the translated key.
      expect(screen.getByText(csMessages.admin.manualMemberNotFound)).toBeInTheDocument();
    });
  });
});

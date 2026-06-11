import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { AdminReversePaymentButton } from '@/components/admin/admin-reverse-payment-button';
import enMessages from '@/messages/en.json';

const mockRefresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }));

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => mockToastSuccess(...a),
    error: (...a: unknown[]) => mockToastError(...a),
  },
}));

vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => async () => true }));

const mockReverse = vi.fn();
vi.mock('@/app/[locale]/(app)/admin/pending/actions', () => ({
  voidConfirmedPaymentAction: (...a: unknown[]) => mockReverse(...a),
}));

beforeEach(() => {
  mockRefresh.mockReset();
  mockToastSuccess.mockReset();
  mockToastError.mockReset();
  mockReverse.mockReset();
});

function renderButton(paymentId = 'p-1') {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <AdminReversePaymentButton paymentId={paymentId} amountLabel="200 Kč" />
    </NextIntlClientProvider>,
  );
}

describe('AdminReversePaymentButton', () => {
  it('renders the reverse control', () => {
    renderButton();
    expect(screen.getByRole('button', { name: /reverse/i })).toBeInTheDocument();
  });

  it('confirmed tap reverses the payment (with a reason) and refreshes', async () => {
    mockReverse.mockResolvedValue({ ok: true });
    renderButton('p-9');
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(mockReverse).toHaveBeenCalledWith({ paymentId: 'p-9', reason: 'admin-correction' });
      expect(mockToastSuccess).toHaveBeenCalled();
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  it('INVALID_STATE (already reversed) surfaces an error toast', async () => {
    mockReverse.mockResolvedValue({ ok: false, code: 'INVALID_STATE' });
    renderButton();
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalled();
      expect(mockRefresh).toHaveBeenCalled();
    });
  });
});

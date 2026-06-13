import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { AdminDeletePaymentButton } from '@/components/admin/admin-delete-payment-button';
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

const mockDelete = vi.fn();
vi.mock('@/app/[locale]/(app)/admin/pending/actions', () => ({
  hardDeletePaymentAction: (...a: unknown[]) => mockDelete(...a),
}));

beforeEach(() => {
  mockRefresh.mockReset();
  mockToastSuccess.mockReset();
  mockToastError.mockReset();
  mockDelete.mockReset();
});

function renderButton(paymentId = 'p-1') {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <AdminDeletePaymentButton paymentId={paymentId} amountLabel="30 Kč" />
    </NextIntlClientProvider>,
  );
}

describe('AdminDeletePaymentButton', () => {
  it('renders an accessible permanent-delete control', () => {
    renderButton();
    expect(screen.getByRole('button', { name: /delete permanently/i })).toBeInTheDocument();
  });

  it('confirmed tap hard-deletes the payment (by id) and refreshes', async () => {
    mockDelete.mockResolvedValue({ ok: true });
    renderButton('p-42');
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('p-42');
      expect(mockToastSuccess).toHaveBeenCalled();
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  it('a failure surfaces an error toast (no crash)', async () => {
    mockDelete.mockResolvedValue({ ok: false, code: 'NOT_FOUND' });
    renderButton();
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalled();
      expect(mockRefresh).toHaveBeenCalled();
    });
  });
});

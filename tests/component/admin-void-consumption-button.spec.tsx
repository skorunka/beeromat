import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { AdminVoidConsumptionButton } from '@/components/admin/admin-void-consumption-button';
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

// Auto-confirm: the dialog resolves true so the action fires.
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => async () => true }));

const mockVoid = vi.fn();
vi.mock('@/app/[locale]/(app)/log/actions', () => ({
  voidConsumptionAction: (...a: unknown[]) => mockVoid(...a),
}));

beforeEach(() => {
  mockRefresh.mockReset();
  mockToastSuccess.mockReset();
  mockToastError.mockReset();
  mockVoid.mockReset();
});

function renderButton(consumptionId = 'c-1') {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <AdminVoidConsumptionButton consumptionId={consumptionId} label="Pilsner" />
    </NextIntlClientProvider>,
  );
}

describe('AdminVoidConsumptionButton', () => {
  it('renders an accessible delete control', () => {
    renderButton();
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
  });

  it('confirmed tap voids the consumption and refreshes', async () => {
    mockVoid.mockResolvedValue({ ok: true, balanceAfterMinor: 0n });
    renderButton('c-42');
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(mockVoid).toHaveBeenCalledWith({ consumptionId: 'c-42' });
      expect(mockToastSuccess).toHaveBeenCalled();
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  it('ALREADY_VOIDED surfaces an error toast (no crash)', async () => {
    mockVoid.mockResolvedValue({ ok: false, code: 'ALREADY_VOIDED' });
    renderButton();
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalled();
      expect(mockRefresh).toHaveBeenCalled();
    });
  });
});

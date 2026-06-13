import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { AdminDeleteConsumptionButton } from '@/components/admin/admin-delete-consumption-button';
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

const mockDelete = vi.fn();
vi.mock('@/app/[locale]/(app)/log/actions', () => ({
  hardDeleteConsumptionAction: (...a: unknown[]) => mockDelete(...a),
}));

beforeEach(() => {
  mockRefresh.mockReset();
  mockToastSuccess.mockReset();
  mockToastError.mockReset();
  mockDelete.mockReset();
});

function renderButton(consumptionId = 'c-1') {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <AdminDeleteConsumptionButton consumptionId={consumptionId} label="Pilsner" />
    </NextIntlClientProvider>,
  );
}

describe('AdminDeleteConsumptionButton', () => {
  it('renders an accessible permanent-delete control', () => {
    renderButton();
    expect(screen.getByRole('button', { name: /delete permanently/i })).toBeInTheDocument();
  });

  it('confirmed tap hard-deletes the consumption and refreshes', async () => {
    mockDelete.mockResolvedValue({ ok: true });
    renderButton('c-42');
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith({ consumptionId: 'c-42' });
      expect(mockToastSuccess).toHaveBeenCalled();
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  it('MATCH_LINKED surfaces an error toast (no crash)', async () => {
    mockDelete.mockResolvedValue({ ok: false, code: 'MATCH_LINKED' });
    renderButton();
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalled();
      expect(mockRefresh).toHaveBeenCalled();
    });
  });
});

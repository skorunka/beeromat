import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ReverseMatchButton } from '@/components/match/reverse-match-button';
import enMessages from '@/messages/en.json';

const mockRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh, push: vi.fn() }),
}));

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => mockToastSuccess(...a),
    error: (...a: unknown[]) => mockToastError(...a),
  },
}));

const mockReverse = vi.fn();
vi.mock('@/app/[locale]/(app)/match/actions', () => ({
  reverseResultAction: (...a: unknown[]) => mockReverse(...a),
}));

beforeEach(() => {
  mockRefresh.mockReset();
  mockToastSuccess.mockReset();
  mockToastError.mockReset();
  mockReverse.mockReset();
});

function renderButton() {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ReverseMatchButton agreementId="agreement-1" />
    </NextIntlClientProvider>,
  );
}

describe('ReverseMatchButton', () => {
  it('successful reverse → success toast + router.refresh', async () => {
    mockReverse.mockResolvedValue({ ok: true, voidedMatchCount: 1, voidedTransferCount: 1 });
    renderButton();
    fireEvent.click(screen.getByRole('button', { name: /reverse this match/i }));
    await waitFor(() => {
      expect(mockReverse).toHaveBeenCalledWith({ agreementId: 'agreement-1' });
      expect(mockToastSuccess).toHaveBeenCalled();
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  it('UNDO_WINDOW_EXPIRED → error toast (no success)', async () => {
    mockReverse.mockResolvedValue({ ok: false, code: 'UNDO_WINDOW_EXPIRED' });
    renderButton();
    fireEvent.click(screen.getByRole('button', { name: /reverse this match/i }));
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalled();
      expect(mockToastSuccess).not.toHaveBeenCalled();
    });
  });

  it('NOT_AUTHORIZED → error toast', async () => {
    mockReverse.mockResolvedValue({ ok: false, code: 'NOT_AUTHORIZED' });
    renderButton();
    fireEvent.click(screen.getByRole('button', { name: /reverse this match/i }));
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalled();
    });
  });

  it('refreshes the route on every result to pick up server state', async () => {
    mockReverse.mockResolvedValue({ ok: false, code: 'NOT_AUTHORIZED' });
    renderButton();
    fireEvent.click(screen.getByRole('button', { name: /reverse this match/i }));
    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalled();
    });
  });
});

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { CloseRoundButton } from '@/components/match/close-round-button';
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

const mockClose = vi.fn();
vi.mock('@/app/[locale]/(app)/match/actions', () => ({
  closeRoundAction: () => mockClose(),
}));

function renderButton(drinkCount = 0) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <CloseRoundButton drinkCount={drinkCount} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  mockRefresh.mockReset();
  mockToastSuccess.mockReset();
  mockToastError.mockReset();
  mockClose.mockReset();
});

describe('CloseRoundButton', () => {
  it('requires a confirm step before closing (no action on first tap)', () => {
    renderButton(7);
    fireEvent.click(screen.getByRole('button', { name: /close this round/i }));
    // Confirm UI shown with the drink count; action not yet called.
    expect(screen.getByText(/end the round\? 7 drinks logged/i)).toBeInTheDocument();
    expect(mockClose).not.toHaveBeenCalled();
  });

  it('cancel backs out without calling the action', () => {
    renderButton();
    fireEvent.click(screen.getByRole('button', { name: /close this round/i }));
    fireEvent.click(screen.getByRole('button', { name: /keep it open/i }));
    expect(screen.getByRole('button', { name: /close this round/i })).toBeInTheDocument();
    expect(mockClose).not.toHaveBeenCalled();
  });

  it('confirm closes the round + success toast + refresh', async () => {
    mockClose.mockResolvedValue({ ok: true });
    renderButton();
    fireEvent.click(screen.getByRole('button', { name: /close this round/i }));
    fireEvent.click(screen.getByRole('button', { name: /^close round$/i }));
    await waitFor(() => {
      expect(mockClose).toHaveBeenCalledTimes(1);
      expect(mockToastSuccess).toHaveBeenCalled();
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  it('NO_OPEN_ROUND result surfaces an error toast', async () => {
    mockClose.mockResolvedValue({ ok: false, code: 'NO_OPEN_ROUND' });
    renderButton();
    fireEvent.click(screen.getByRole('button', { name: /close this round/i }));
    fireEvent.click(screen.getByRole('button', { name: /^close round$/i }));
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalled();
    });
  });
});

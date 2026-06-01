import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { RecreateLastMatchButton } from '@/components/match/recreate-last-match-button';
import enMessages from '@/messages/en.json';

const mockPush = vi.fn();
const mockRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => mockToastSuccess(...a),
    error: (...a: unknown[]) => mockToastError(...a),
  },
}));

const mockRecreate = vi.fn();
vi.mock('@/app/[locale]/(app)/match/actions', () => ({
  recreateLastMatchAction: () => mockRecreate(),
}));

beforeEach(() => {
  mockPush.mockReset();
  mockRefresh.mockReset();
  mockToastSuccess.mockReset();
  mockToastError.mockReset();
  mockRecreate.mockReset();
});

function renderButton(sideA = 'Franta + Pepa', sideB = 'Honza + Standa') {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <RecreateLastMatchButton sideA={sideA} sideB={sideB} />
    </NextIntlClientProvider>,
  );
}

describe('RecreateLastMatchButton', () => {
  it('renders the matchup label from props', () => {
    renderButton();
    expect(screen.getByText(/recreate:/i)).toBeInTheDocument();
    expect(screen.getByText(/franta \+ pepa/i)).toBeInTheDocument();
    expect(screen.getByText(/honza \+ standa/i)).toBeInTheDocument();
  });

  it('tap dispatches the action and navigates to the new agreement on success', async () => {
    mockRecreate.mockResolvedValue({ ok: true, agreementId: 'new-agr-1' });
    renderButton();
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(mockRecreate).toHaveBeenCalledTimes(1);
      expect(mockToastSuccess).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith('/match/new-agr-1');
    });
  });

  it('STALE_PARTICIPANT result surfaces an error toast and does NOT navigate', async () => {
    mockRecreate.mockResolvedValue({ ok: false, code: 'STALE_PARTICIPANT', memberName: 'Bob' });
    renderButton();
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  it('generic failure surfaces a generic error toast', async () => {
    mockRecreate.mockResolvedValue({ ok: false, code: 'NO_LAST_MATCH' });
    renderButton();
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });
  });
});

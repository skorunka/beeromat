import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { RepeatMatchButton } from '@/components/match/repeat-match-button';
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
  recreateMatchAction: (...a: unknown[]) => mockRecreate(...a),
}));

beforeEach(() => {
  mockPush.mockReset();
  mockRefresh.mockReset();
  mockToastSuccess.mockReset();
  mockToastError.mockReset();
  mockRecreate.mockReset();
});

function renderButton(agreementId = 'agr-42') {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <RepeatMatchButton agreementId={agreementId} />
    </NextIntlClientProvider>,
  );
}

describe('RepeatMatchButton', () => {
  it('renders an accessible repeat button', () => {
    renderButton();
    expect(screen.getByRole('button', { name: /repeat this match/i })).toBeInTheDocument();
  });

  it('tap dispatches the action with the row agreementId and navigates on success', async () => {
    mockRecreate.mockResolvedValue({ ok: true, agreementId: 'new-agr-1' });
    renderButton('agr-42');
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(mockRecreate).toHaveBeenCalledWith({ agreementId: 'agr-42' });
      expect(mockToastSuccess).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith('/match/new-agr-1');
    });
  });

  it('STALE_PARTICIPANT surfaces an error toast and does NOT navigate', async () => {
    mockRecreate.mockResolvedValue({ ok: false, code: 'STALE_PARTICIPANT', memberName: 'Bob' });
    renderButton();
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  it('AGREEMENT_NOT_FOUND surfaces a generic error toast', async () => {
    mockRecreate.mockResolvedValue({ ok: false, code: 'AGREEMENT_NOT_FOUND' });
    renderButton();
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });
  });
});

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { RsvpToggle } from '@/components/events/rsvp-toggle';
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

const mockSet = vi.fn();
vi.mock('@/app/[locale]/(app)/events/actions', () => ({
  setMyRsvpAction: (...a: unknown[]) => mockSet(...a),
}));

beforeEach(() => {
  mockRefresh.mockReset();
  mockToastSuccess.mockReset();
  mockToastError.mockReset();
  mockSet.mockReset();
});

function renderToggle(status: 'going' | 'not_going' | null = null, disabled = false) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <RsvpToggle occurrenceId="occ-1" status={status} disabled={disabled} />
    </NextIntlClientProvider>,
  );
}

describe('RsvpToggle', () => {
  it('tapping "I\'m in" sets going + refreshes', async () => {
    mockSet.mockResolvedValue({ ok: true });
    renderToggle(null);
    fireEvent.click(screen.getByRole('button', { name: /i'm in/i }));
    await waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith({ occurrenceId: 'occ-1', status: 'going' });
      expect(mockToastSuccess).toHaveBeenCalled();
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  it('tapping "Can\'t make it" sets not_going', async () => {
    mockSet.mockResolvedValue({ ok: true });
    renderToggle('going');
    fireEvent.click(screen.getByRole('button', { name: /can't make it/i }));
    await waitFor(() =>
      expect(mockSet).toHaveBeenCalledWith({ occurrenceId: 'occ-1', status: 'not_going' }),
    );
  });

  it('CLOSED result surfaces the closed toast', async () => {
    mockSet.mockResolvedValue({ ok: false, code: 'CLOSED' });
    renderToggle(null);
    fireEvent.click(screen.getByRole('button', { name: /i'm in/i }));
    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
  });

  it('disabled: no action fired', () => {
    renderToggle(null, true);
    fireEvent.click(screen.getByRole('button', { name: /i'm in/i }));
    expect(mockSet).not.toHaveBeenCalled();
  });
});

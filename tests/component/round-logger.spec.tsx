import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { RoundLogger } from '@/components/home/round-logger';
import type { RoundMemberOption } from '@/components/picker/member-multi-select';
import enMessages from '@/messages/en.json';

// Spec 033 — the round logger (multi-select). Action mocked.

const mockLogRound = vi.fn();
vi.mock('@/app/[locale]/(app)/log/actions', () => ({
  logRoundAction: (...a: unknown[]) => mockLogRound(...a),
}));
const mockRefresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }));
vi.mock('@/lib/celebrate', () => ({ celebrateBeer: vi.fn() }));
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => mockToastSuccess(...a),
    error: (...a: unknown[]) => mockToastError(...a),
  },
}));

const SELF = 'self-1';
const PEPA = 'pepa-2';
const BEER_A = 'beer-a';
const BEER_B = 'beer-b';

const members: RoundMemberOption[] = [
  { id: SELF, displayName: 'Franta', avatarKey: null, avatarUploadAt: null, isSelf: true },
  { id: PEPA, displayName: 'Pepa', avatarKey: null, avatarUploadAt: null, isSelf: false },
];
const beers = [
  { id: BEER_A, name: 'Svijany', unitPriceMinor: 40n, currentStock: 10 },
  { id: BEER_B, name: 'Pilsner', unitPriceMinor: 45n, currentStock: 10 },
];

function renderLogger() {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <RoundLogger
        members={members}
        beers={beers}
        defaultBeerTypeId={BEER_A}
        currencyCode="CZK"
        locale="en"
      />
    </NextIntlClientProvider>,
  );
}

function expand() {
  fireEvent.click(screen.getByRole('button', { name: /log a round/i }));
}

beforeEach(() => {
  mockLogRound.mockReset();
  mockRefresh.mockReset();
  mockToastSuccess.mockReset();
  mockToastError.mockReset();
});

describe('RoundLogger (component — spec 033)', () => {
  it('expands and pre-selects the logger', () => {
    renderLogger();
    expand();
    expect(screen.getByRole('button', { name: /Franta \(you\)/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /Log round · 1 beer/i })).toBeInTheDocument();
  });

  it('toggling a teammate updates the count + submit label', () => {
    renderLogger();
    expand();
    fireEvent.click(screen.getByRole('button', { name: 'Pepa' }));
    expect(screen.getByRole('button', { name: /Log round · 2 beers/i })).toBeInTheDocument();
  });

  it('disables submit when no drinkers are selected', () => {
    renderLogger();
    expand();
    fireEvent.click(screen.getByRole('button', { name: /Franta \(you\)/i })); // deselect self
    expect(screen.getByRole('button', { name: /Log round/i })).toBeDisabled();
  });

  it('submits the expected items, celebrates, refreshes, and resets', async () => {
    mockLogRound.mockResolvedValue({
      ok: true,
      logged: [
        { memberId: SELF, beerTypeId: BEER_A, consumptionId: 'c1' },
        { memberId: PEPA, beerTypeId: BEER_A, consumptionId: 'c2' },
      ],
      skipped: [],
      sessionId: 's',
      balanceAfterMinor: 0n,
    });
    renderLogger();
    expand();
    fireEvent.click(screen.getByRole('button', { name: 'Pepa' }));
    fireEvent.click(screen.getByRole('button', { name: /Log round · 2 beers/i }));

    await waitFor(() => expect(mockLogRound).toHaveBeenCalledTimes(1));
    const payload = mockLogRound.mock.calls[0]![0] as { items: unknown[] };
    expect(payload.items).toHaveLength(2);
    expect(payload.items).toEqual(
      expect.arrayContaining([
        { memberId: SELF, beerTypeId: BEER_A },
        { memberId: PEPA, beerTypeId: BEER_A },
      ]),
    );
    expect(mockToastSuccess).toHaveBeenCalled();
    expect(mockRefresh).toHaveBeenCalled();
    // Reset → back to just the logger (count 1).
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Log round · 1 beer/i })).toBeInTheDocument(),
    );
  });

  it('an all-skipped result shows an error toast and does NOT reset', async () => {
    mockLogRound.mockResolvedValue({ ok: false, code: 'ALL_SKIPPED' });
    renderLogger();
    expand();
    fireEvent.click(screen.getByRole('button', { name: 'Pepa' }));
    fireEvent.click(screen.getByRole('button', { name: /Log round · 2 beers/i }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    // Selection preserved (still 2) — nothing was logged.
    expect(screen.getByRole('button', { name: /Log round · 2 beers/i })).toBeInTheDocument();
  });

  it('reveals a per-person beer override row for each drinker on toggle', () => {
    renderLogger();
    expand();
    fireEvent.click(screen.getByRole('button', { name: 'Pepa' })); // both selected
    fireEvent.click(screen.getByRole('button', { name: /different beer/i }));
    expect(screen.getByLabelText('Different beer for Franta')).toBeInTheDocument();
    expect(screen.getByLabelText('Different beer for Pepa')).toBeInTheDocument();
  });
});

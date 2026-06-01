import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { HomeLogForOther } from '@/components/home/home-log-for-other';
import type { MemberOption } from '@/components/picker/types';
import type { BeerPickerOption } from '@/components/picker/beer-picker-dropdown';
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

const mockLog = vi.fn();
vi.mock('@/app/[locale]/(app)/log/actions', () => ({
  logBeerOnBehalfAction: (...a: unknown[]) => mockLog(...a),
}));

vi.mock('@/lib/celebrate', () => ({ celebrateBeer: vi.fn() }));

const members: MemberOption[] = [
  { id: 'm-pavel', displayName: 'Pavel', avatarKey: null, avatarUploadAt: null },
  { id: 'm-standa', displayName: 'Standa', avatarKey: 'star', avatarUploadAt: null },
];
const beers: BeerPickerOption[] = [
  { id: 'b-pils', name: 'Pilsner', unitPriceMinor: 4000n, currentStock: 10 },
];

function renderControl() {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <HomeLogForOther members={members} beers={beers} currencyCode="CZK" locale="en" />
    </NextIntlClientProvider>,
  );
}

async function expandAndPick() {
  // Expand.
  fireEvent.click(screen.getByRole('button', { name: /log for someone else/i }));
  // Pick member (open the member dropdown, choose Pavel).
  fireEvent.click(screen.getByRole('button', { name: enMessages.log.onBehalf.memberHint }));
  await waitFor(() => screen.getByRole('menuitemradio', { name: /Pavel/ }));
  fireEvent.click(screen.getByRole('menuitemradio', { name: /Pavel/ }));
  // Pick beer.
  fireEvent.click(screen.getByRole('button', { name: enMessages.log.onBehalf.beerHint }));
  await waitFor(() => screen.getByRole('menuitemradio', { name: /Pilsner/ }));
  fireEvent.click(screen.getByRole('menuitemradio', { name: /Pilsner/ }));
}

beforeEach(() => {
  mockRefresh.mockReset();
  mockToastSuccess.mockReset();
  mockToastError.mockReset();
  mockLog.mockReset();
});

describe('HomeLogForOther', () => {
  it('is collapsed by default and expands on tap', () => {
    renderControl();
    // Collapsed: the affordance is present; the picker hints are not.
    expect(screen.getByRole('button', { name: /log for someone else/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: enMessages.log.onBehalf.memberHint })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /log for someone else/i }));
    expect(screen.getByRole('button', { name: enMessages.log.onBehalf.memberHint })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: enMessages.log.onBehalf.beerHint })).toBeInTheDocument();
  });

  it('Log is disabled until both a member and a beer are chosen', async () => {
    renderControl();
    fireEvent.click(screen.getByRole('button', { name: /log for someone else/i }));
    // The Log button (only member/beer dropdowns + Log are buttons; find the submit-ish one).
    const logBtn = screen.getByRole('button', { name: enMessages.log.onBehalf.logCta });
    expect(logBtn).toBeDisabled();
  });

  it('dispatches logBeerOnBehalfAction with the chosen ids and keeps selections on success', async () => {
    mockLog.mockResolvedValue({ ok: true, consumptionId: 'c1', targetMemberId: 'm-pavel' });
    renderControl();
    await expandAndPick();
    // After both picked, the Log button shows the sentence form "Log {beer} for {member}".
    const logBtn = screen.getByRole('button', { name: /log pilsner for pavel/i });
    fireEvent.click(logBtn);
    await waitFor(() => {
      expect(mockLog).toHaveBeenCalledWith({ beerTypeId: 'b-pils', targetMemberId: 'm-pavel' });
      expect(mockToastSuccess).toHaveBeenCalled();
      expect(mockRefresh).toHaveBeenCalled();
    });
    // Selections preserved → the sentence-form button is still present.
    expect(screen.getByRole('button', { name: /log pilsner for pavel/i })).toBeInTheDocument();
  });

  it('surfaces a typed error and does not treat it as success', async () => {
    mockLog.mockResolvedValue({ ok: false, code: 'OUT_OF_STOCK' });
    renderControl();
    await expandAndPick();
    fireEvent.click(screen.getByRole('button', { name: /log pilsner for pavel/i }));
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalled();
      expect(mockToastSuccess).not.toHaveBeenCalled();
    });
  });

  it('collapse toggle returns to the compact affordance', () => {
    renderControl();
    fireEvent.click(screen.getByRole('button', { name: /log for someone else/i }));
    fireEvent.click(screen.getByRole('button', { name: enMessages.log.onBehalf.collapse }));
    expect(screen.getByRole('button', { name: /log for someone else/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: enMessages.log.onBehalf.memberHint })).toBeNull();
  });
});

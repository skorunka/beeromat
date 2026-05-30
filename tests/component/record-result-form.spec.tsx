import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { RecordResultForm } from '@/app/[locale]/(app)/match/[agreementId]/RecordResultForm';
import enMessages from '@/messages/en.json';

// Spec 025 T007 — component test for the tile-grid bet-beer picker
// inside RecordResultForm.

const mockRecordResultAction = vi.fn();
const mockReverseResultAction = vi.fn();
vi.mock('@/app/[locale]/(app)/match/actions', () => ({
  recordResultAction: (...args: unknown[]) => mockRecordResultAction(...args),
  reverseResultAction: (...args: unknown[]) => mockReverseResultAction(...args),
}));

const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const seedBeers = [
  { id: 'b-pilsner', name: 'Pilsner' },
  { id: 'b-stout', name: 'Stout' },
];

function renderForm(opts: {
  betBeerOptions?: Array<{ id: string; name: string }>;
  loserLastBeerName?: string | null;
  loserBeerCount?: number;
} = {}) {
  // Use `in opts` checks so an explicit `undefined` or `null` is
  // honored (the `??` fallback would collapse them to defaults).
  const beers = 'betBeerOptions' in opts ? opts.betBeerOptions : seedBeers;
  const lastBeer =
    'loserLastBeerName' in opts ? opts.loserLastBeerName : 'Pilsner';
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <RecordResultForm
        agreementId="agreement-1"
        sideALabel="Side A"
        sideBLabel="Side B"
        betBeerOptions={beers}
        loserLastBeerName={lastBeer}
        loserBeerCount={opts.loserBeerCount ?? 1}
      />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  mockRecordResultAction.mockReset();
  mockReverseResultAction.mockReset();
  mockToastError.mockReset();
  mockToastSuccess.mockReset();
});

describe('RecordResultForm — bet-beer dropdown picker', () => {
  it('trigger shows Auto · {last beer} pre-selected when last-beer is known', () => {
    renderForm({ loserLastBeerName: 'Stout' });
    // The dropdown trigger is the only button carrying the Auto label.
    expect(screen.getByRole('button', { name: /Auto · Stout/i })).toBeInTheDocument();
  });

  it('trigger falls back to "Auto · Beer" when last-beer is null', () => {
    renderForm({ loserLastBeerName: null });
    expect(screen.getByRole('button', { name: /Auto · Beer/i })).toBeInTheDocument();
  });

  it('submit with the default Auto pick omits betBeerOverrideId from the payload', async () => {
    mockRecordResultAction.mockResolvedValue({
      ok: true,
      transferredCount: 1,
      requestedCount: 1,
    });
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: /Side A won/i }));

    await waitFor(() => {
      expect(mockRecordResultAction).toHaveBeenCalledTimes(1);
    });
    const payload = mockRecordResultAction.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload).toEqual({ agreementId: 'agreement-1', winningSide: 'A' });
    expect(payload).not.toHaveProperty('betBeerOverrideId');
  });

  it('picker is hidden when betBeerOptions is undefined (not-for-beer or not-authorized)', () => {
    renderForm({ betBeerOptions: undefined });
    // No Auto trigger button.
    expect(screen.queryByRole('button', { name: /Auto/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Side A won/i })).toBeInTheDocument();
  });

  it('picker is hidden when betBeerOptions is an empty array', () => {
    renderForm({ betBeerOptions: [] });
    expect(screen.queryByRole('button', { name: /Auto/i })).not.toBeInTheDocument();
  });

  describe('loser-buys explainer (usability follow-up)', () => {
    it('names the selected beer + count for a for-beer match', () => {
      renderForm({ loserLastBeerName: 'Pilsner', loserBeerCount: 2 });
      expect(
        screen.getByText(/whoever loses buys 2× pilsner for the winner/i),
      ).toBeInTheDocument();
    });

    it('falls back to the beer-less explainer when no beer name is known', () => {
      renderForm({ loserLastBeerName: null, loserBeerCount: 1 });
      expect(
        screen.getByText(/whoever loses buys 1× beer for the winner/i),
      ).toBeInTheDocument();
    });

    it('no explainer for a not-for-beer match (picker absent)', () => {
      renderForm({ betBeerOptions: undefined });
      expect(screen.queryByText(/whoever loses buys/i)).not.toBeInTheDocument();
    });
  });
});

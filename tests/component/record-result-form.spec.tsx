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

describe('RecordResultForm — bet-beer tile grid (spec 025)', () => {
  it('renders one tile per beer plus the Auto tile, with Auto pre-selected', () => {
    renderForm();
    // 1 Auto tile + 2 beer tiles = 3 picker buttons (plus the
    // "who won" buttons which we filter out via aria-pressed).
    const pickerTiles = screen
      .getAllByRole('button')
      .filter((b) => b.hasAttribute('aria-pressed'));
    expect(pickerTiles).toHaveLength(3);

    const autoTile = pickerTiles.find((b) => /^Auto/.test(b.textContent ?? ''));
    expect(autoTile).toBeDefined();
    expect(autoTile).toHaveAttribute('aria-pressed', 'true');
    // Beer tiles are not selected.
    const pilsnerTile = screen.getByRole('button', { name: 'Pilsner', pressed: false });
    const stoutTile = screen.getByRole('button', { name: 'Stout', pressed: false });
    expect(pilsnerTile).toBeInTheDocument();
    expect(stoutTile).toBeInTheDocument();
  });

  it('Auto tile shows recorder last-beer name when provided', () => {
    renderForm({ loserLastBeerName: 'Stout' });
    expect(screen.getByRole('button', { name: /Auto · Stout/i })).toBeInTheDocument();
  });

  it('Auto tile falls back to the localized "Auto · Beer" string when loserLastBeerName is null', () => {
    renderForm({ loserLastBeerName: null });
    expect(screen.getByRole('button', { name: /Auto · Beer/i })).toBeInTheDocument();
  });

  it('tapping a non-Auto tile flips selection (Auto deselects, beer becomes pressed)', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Stout' }));
    expect(screen.getByRole('button', { name: 'Stout' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const autoTile = screen.getByRole('button', { name: /Auto/i });
    expect(autoTile).toHaveAttribute('aria-pressed', 'false');
  });

  it('tapping the Auto tile after a non-Auto pick reselects Auto', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Stout' }));
    fireEvent.click(screen.getByRole('button', { name: /Auto/i }));
    expect(screen.getByRole('button', { name: /Auto/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Stout' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('submit with Auto selected omits betBeerOverrideId from the action payload', async () => {
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
    expect(payload).toEqual({
      agreementId: 'agreement-1',
      winningSide: 'A',
    });
    expect(payload).not.toHaveProperty('betBeerOverrideId');
  });

  it('submit with a beer tile selected includes betBeerOverrideId in the payload', async () => {
    mockRecordResultAction.mockResolvedValue({
      ok: true,
      transferredCount: 1,
      requestedCount: 1,
    });
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Stout' }));
    fireEvent.click(screen.getByRole('button', { name: /Side B won/i }));

    await waitFor(() => {
      expect(mockRecordResultAction).toHaveBeenCalledTimes(1);
    });
    expect(mockRecordResultAction.mock.calls[0]![0]).toEqual({
      agreementId: 'agreement-1',
      winningSide: 'B',
      betBeerOverrideId: 'b-stout',
    });
  });

  it('picker is hidden when betBeerOptions is undefined (not-for-beer or not-authorized)', () => {
    renderForm({ betBeerOptions: undefined });
    // No tile carries aria-pressed.
    const pickerTiles = screen
      .getAllByRole('button')
      .filter((b) => b.hasAttribute('aria-pressed'));
    expect(pickerTiles).toHaveLength(0);
    // The "who won" buttons still render.
    expect(screen.getByRole('button', { name: /Side A won/i })).toBeInTheDocument();
  });

  it('picker is hidden when betBeerOptions is an empty array', () => {
    renderForm({ betBeerOptions: [] });
    const pickerTiles = screen
      .getAllByRole('button')
      .filter((b) => b.hasAttribute('aria-pressed'));
    expect(pickerTiles).toHaveLength(0);
  });
});

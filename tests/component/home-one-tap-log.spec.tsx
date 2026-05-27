import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { HomeOneTapLog } from '@/components/home/home-one-tap-log';
import enMessages from '@/messages/en.json';
import csMessages from '@/messages/cs.json';

// Spec 017 + 2026-05-27 refinement — component tests for the split-
// button home log surface. The old V3/V4 "render a Link to /log"
// expectations are gone; their job now lives in the chevron dropdown.

const mockLogBeerAction = vi.fn();
vi.mock('@/app/[locale]/(app)/log/actions', () => ({
  logBeerAction: (...args: unknown[]) => mockLogBeerAction(...args),
}));

const mockRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh, push: vi.fn(), replace: vi.fn() }),
}));

const PILSNER = {
  id: 'b1',
  name: 'Pilsner',
  currentStock: 42,
  isArchived: false,
  unitPriceMinor: 5000n,
} as const;

const KOZEL = {
  id: 'b2',
  name: 'Kozel',
  currentStock: 20,
  isArchived: false,
  unitPriceMinor: 4500n,
} as const;

function renderWithLocale(node: React.ReactElement, locale: 'cs' | 'en' = 'en') {
  const messages = locale === 'en' ? enMessages : csMessages;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      {node}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  mockLogBeerAction.mockReset();
  mockRefresh.mockReset();
});

describe('HomeOneTapLog (split-button — spec 017 refinement)', () => {
  describe('default beer valid + in stock', () => {
    it('renders the main "Log a Pilsner" button with the beer name', () => {
      renderWithLocale(
        <HomeOneTapLog
          beer={PILSNER}
          catalog={[PILSNER, KOZEL]}
          currencyCode="CZK"
          locale="en"
        />,
      );
      expect(
        screen.getByRole('button', { name: /log a pilsner/i }),
      ).toBeInTheDocument();
    });

    it('logs the default beer on main-button tap', async () => {
      mockLogBeerAction.mockResolvedValue({ ok: true, balanceAfterMinor: 12000n });
      renderWithLocale(
        <HomeOneTapLog
          beer={PILSNER}
          catalog={[PILSNER, KOZEL]}
          currencyCode="CZK"
          locale="en"
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: /log a pilsner/i }));
      await waitFor(() => {
        expect(mockLogBeerAction).toHaveBeenCalledWith({ beerTypeId: PILSNER.id });
      });
    });

    it('renders a chevron dropdown trigger when other beers exist', () => {
      renderWithLocale(
        <HomeOneTapLog
          beer={PILSNER}
          catalog={[PILSNER, KOZEL]}
          currencyCode="CZK"
          locale="en"
        />,
      );
      // The chevron trigger uses the "pick another" aria-label.
      expect(
        screen.getByRole('button', { name: /pick a different beer/i }),
      ).toBeInTheDocument();
    });

    it('omits the chevron when the catalog has only the default beer', () => {
      renderWithLocale(
        <HomeOneTapLog
          beer={PILSNER}
          catalog={[PILSNER]}
          currencyCode="CZK"
          locale="en"
        />,
      );
      expect(
        screen.queryByRole('button', { name: /pick a different beer/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe('no usable default (null / archived / out of stock)', () => {
    it('renders the generic dropdown trigger when there is no last beer', () => {
      renderWithLocale(
        <HomeOneTapLog
          beer={null}
          catalog={[PILSNER, KOZEL]}
          currencyCode="CZK"
          locale="en"
        />,
      );
      // Whole button is a dropdown trigger — no /log link anywhere.
      expect(screen.getByRole('button', { name: /log a beer/i })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /log a beer/i })).not.toBeInTheDocument();
    });

    it('shows "Pilsner — nedostupné" when the default is out of stock', () => {
      renderWithLocale(
        <HomeOneTapLog
          beer={{ ...PILSNER, currentStock: 0 }}
          catalog={[KOZEL]}
          currencyCode="CZK"
          locale="cs"
        />,
        'cs',
      );
      expect(screen.getByRole('button', { name: /pilsner.*nedostupné/i })).toBeInTheDocument();
    });

    it('renders a disabled empty-state when the whole catalog is empty', () => {
      renderWithLocale(
        <HomeOneTapLog beer={null} catalog={[]} currencyCode="CZK" locale="en" />,
      );
      const btn = screen.getByRole('button', { name: /log a beer/i });
      expect(btn).toBeDisabled();
    });
  });

  describe('pending state', () => {
    it('disables the main button while a tap is in flight', async () => {
      let resolve: ((v: unknown) => void) | undefined;
      mockLogBeerAction.mockImplementationOnce(
        () =>
          new Promise<unknown>((r) => {
            resolve = r;
          }),
      );
      renderWithLocale(
        <HomeOneTapLog
          beer={PILSNER}
          catalog={[PILSNER]}
          currencyCode="CZK"
          locale="en"
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: /log a pilsner/i }));
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /log a pilsner/i })).toBeDisabled();
      });
      resolve?.({ ok: true, balanceAfterMinor: 5000n });
    });
  });
});

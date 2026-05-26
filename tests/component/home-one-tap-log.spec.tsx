import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { HomeOneTapLog } from '@/components/home/home-one-tap-log';
import enMessages from '@/messages/en.json';
import csMessages from '@/messages/cs.json';

// Spec 017 T006 + T014 — component test for HomeOneTapLog across
// the five render variants from contracts/home-page.md.

// Mock the server action. logBeerAction is imported via a relative
// path inside the component; we vi.mock the module path it imports
// from.
const mockLogBeerAction = vi.fn();
vi.mock('@/app/[locale]/(app)/log/actions', () => ({
  logBeerAction: (...args: unknown[]) => mockLogBeerAction(...args),
}));

// Mock the next/navigation router so router.refresh() doesn't blow up.
const mockRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh, push: vi.fn(), replace: vi.fn() }),
}));

// Mock i18n navigation Link as a plain anchor.
vi.mock('@/lib/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

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

describe('HomeOneTapLog (component layer — spec 017)', () => {
  describe('V1 — active beer, in stock, enabled', () => {
    it('renders the "Log a Pilsner" button in English with the beer-glass icon', () => {
      renderWithLocale(
        <HomeOneTapLog
          beer={{ id: 'b1', name: 'Pilsner', currentStock: 42, isArchived: false }}
          currencyCode="CZK"
          locale="en"
        />,
        'en',
      );
      const button = screen.getByRole('button', { name: /log a pilsner/i });
      expect(button).toBeEnabled();
      // Tap fallback link is rendered alongside.
      expect(screen.getByRole('link', { name: /pick a different beer/i })).toBeInTheDocument();
    });

    it('renders the "Zapiš Pilsner" button in Czech', () => {
      renderWithLocale(
        <HomeOneTapLog
          beer={{ id: 'b1', name: 'Pilsner', currentStock: 42, isArchived: false }}
          currencyCode="CZK"
          locale="cs"
        />,
        'cs',
      );
      expect(screen.getByRole('button', { name: /zapiš pilsner/i })).toBeEnabled();
      expect(screen.getByRole('link', { name: /vyber jiné pivo/i })).toBeInTheDocument();
    });

    it('calls logBeerAction with the beer id on tap and surfaces the success toast', async () => {
      mockLogBeerAction.mockResolvedValueOnce({
        ok: true,
        consumptionId: 'c1',
        sessionId: 's1',
        balanceAfterMinor: 42000n,
      });
      renderWithLocale(
        <HomeOneTapLog
          beer={{ id: 'b1', name: 'Pilsner', currentStock: 42, isArchived: false }}
          currencyCode="CZK"
          locale="en"
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: /log a pilsner/i }));

      await waitFor(() => {
        expect(mockLogBeerAction).toHaveBeenCalledWith({ beerTypeId: 'b1' });
      });
      // router.refresh is invoked after success.
      await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
    });

    it('does not refresh on failure (FR-009)', async () => {
      mockLogBeerAction.mockResolvedValueOnce({ ok: false, code: 'OUT_OF_STOCK' });
      renderWithLocale(
        <HomeOneTapLog
          beer={{ id: 'b1', name: 'Pilsner', currentStock: 42, isArchived: false }}
          currencyCode="CZK"
          locale="en"
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: /log a pilsner/i }));
      await waitFor(() => expect(mockLogBeerAction).toHaveBeenCalledOnce());
      expect(mockRefresh).not.toHaveBeenCalled();
    });
  });

  describe('V3 — first-time logger (no last beer)', () => {
    it('renders a generic "Log a beer" link to /log', () => {
      renderWithLocale(
        <HomeOneTapLog beer={null} currencyCode="CZK" locale="en" />,
      );
      const link = screen.getByRole('link', { name: /log a beer/i });
      expect(link).toHaveAttribute('href', '/log');
      // No button rendered in the generic variant.
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });

  describe('V4 — archived last beer', () => {
    it('falls back to the generic link, ignoring the archived beer name', () => {
      renderWithLocale(
        <HomeOneTapLog
          beer={{ id: 'b1', name: 'Old IPA', currentStock: 30, isArchived: true }}
          currencyCode="CZK"
          locale="en"
        />,
      );
      // Archived beer's name MUST NOT appear — falls back to the generic.
      expect(screen.queryByText(/Old IPA/i)).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: /log a beer/i })).toHaveAttribute(
        'href',
        '/log',
      );
    });
  });

  describe('V5 — out of stock', () => {
    it('renders the beer name in a disabled button with a fallback picker link', () => {
      renderWithLocale(
        <HomeOneTapLog
          beer={{ id: 'b1', name: 'Pilsner', currentStock: 0, isArchived: false }}
          currencyCode="CZK"
          locale="en"
        />,
      );
      const button = screen.getByRole('button', { name: /pilsner.*out of stock/i });
      expect(button).toBeDisabled();
      expect(screen.getByRole('link', { name: /pick a different beer/i })).toHaveAttribute(
        'href',
        '/log',
      );
    });

    it('renders "Pilsner — nedostupné" in Czech', () => {
      renderWithLocale(
        <HomeOneTapLog
          beer={{ id: 'b1', name: 'Pilsner', currentStock: 0, isArchived: false }}
          currencyCode="CZK"
          locale="cs"
        />,
        'cs',
      );
      expect(screen.getByRole('button', { name: /pilsner.*nedostupné/i })).toBeDisabled();
    });
  });

  describe('V6 — pending state during the server round-trip', () => {
    it('disables the button while the action is in flight', async () => {
      // Slow-resolve so we can observe the pending state.
      let resolve: ((v: unknown) => void) | undefined;
      mockLogBeerAction.mockImplementationOnce(
        () =>
          new Promise<unknown>((r) => {
            resolve = r;
          }),
      );

      renderWithLocale(
        <HomeOneTapLog
          beer={{ id: 'b1', name: 'Pilsner', currentStock: 42, isArchived: false }}
          currencyCode="CZK"
          locale="en"
        />,
      );

      const button = screen.getByRole('button', { name: /log a pilsner/i });
      fireEvent.click(button);

      // During the in-flight window: aria-busy + disabled.
      await waitFor(() => {
        expect(button).toBeDisabled();
        expect(button).toHaveAttribute('aria-busy', 'true');
      });

      // Resolve to let the test exit cleanly.
      resolve?.({
        ok: true,
        consumptionId: 'c1',
        sessionId: 's1',
        balanceAfterMinor: 42000n,
      });
    });
  });
});

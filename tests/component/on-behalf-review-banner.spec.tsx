import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { OnBehalfReviewBanner } from '@/components/home/on-behalf-review-banner';
import enMessages from '@/messages/en.json';
import csMessages from '@/messages/cs.json';

// Spec 019 T020 — component test for the home review banner.

const mockVoid = vi.fn();
const mockDismiss = vi.fn();
vi.mock('@/app/[locale]/(app)/log/actions', () => ({
  voidConsumptionAction: (...args: unknown[]) => mockVoid(...args),
  dismissOnBehalfReviewAction: (...args: unknown[]) => mockDismiss(...args),
}));

const mockRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh, push: vi.fn(), replace: vi.fn() }),
}));

type BannerRow = Parameters<typeof OnBehalfReviewBanner>[0]['rows'][number];

// Test helper — accept minimal-shape inputs (existing spec 019
// tests) and fill in the spec 026 logger-avatar fields as null
// by default so old tests pass without churn.
function row(
  partial: Partial<BannerRow> & Pick<BannerRow, 'consumptionId' | 'loggerDisplayName' | 'beerName'>,
): BannerRow {
  return {
    loggerMemberId: null,
    loggerAvatarKey: null,
    loggerAvatarUploadAt: null,
    ...partial,
  };
}

function renderBanner(rows: BannerRow[], locale: 'cs' | 'en' = 'en') {
  const messages = locale === 'en' ? enMessages : csMessages;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <OnBehalfReviewBanner rows={rows} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  mockVoid.mockReset();
  mockDismiss.mockReset();
  mockRefresh.mockReset();
});

describe('OnBehalfReviewBanner (component layer — spec 019)', () => {
  it('V1 — renders nothing when rows is empty', () => {
    const { container } = renderBanner([]);
    expect(container.firstChild).toBeNull();
  });

  it('V2 — single row renders logger + beer + two buttons', () => {
    renderBanner([
      row({ consumptionId: 'c-1', loggerDisplayName: 'Pavel', beerName: 'Kozel' }),
    ]);
    expect(screen.getByText(/pavel logged for you: kozel/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reverse/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /keep/i })).toBeInTheDocument();
  });

  it('V2 — Czech variant: "Pavel ti zapsal/a: Kozel"', () => {
    renderBanner(
      [row({ consumptionId: 'c-1', loggerDisplayName: 'Pavel', beerName: 'Kozel' })],
      'cs',
    );
    expect(screen.getByText(/pavel ti zapsal\/a: kozel/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /vrátit/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /nechat/i })).toBeInTheDocument();
  });

  it('V3 — multi-row shows each consumption with its own buttons', () => {
    renderBanner([
      row({ consumptionId: 'c-1', loggerDisplayName: 'Pavel', beerName: 'Kozel' }),
      row({ consumptionId: 'c-2', loggerDisplayName: 'Tereza', beerName: 'Pilsner' }),
    ]);
    expect(screen.getByText(/pavel logged for you: kozel/i)).toBeInTheDocument();
    expect(screen.getByText(/tereza logged for you: pilsner/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /reverse/i })).toHaveLength(2);
  });

  it('tapping Reverse calls voidConsumptionAction then dismissOnBehalfReviewAction', async () => {
    mockVoid.mockResolvedValueOnce({ ok: true });
    mockDismiss.mockResolvedValueOnce({ ok: true });
    renderBanner([
      row({ consumptionId: 'c-1', loggerDisplayName: 'Pavel', beerName: 'Kozel' }),
    ]);
    fireEvent.click(screen.getByRole('button', { name: /reverse/i }));
    await waitFor(() => {
      expect(mockVoid).toHaveBeenCalledWith({ consumptionId: 'c-1' });
      expect(mockDismiss).toHaveBeenCalledWith({ consumptionId: 'c-1' });
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
  });

  it('tapping Keep calls dismissOnBehalfReviewAction only (not void)', async () => {
    mockDismiss.mockResolvedValueOnce({ ok: true });
    renderBanner([
      row({ consumptionId: 'c-1', loggerDisplayName: 'Pavel', beerName: 'Kozel' }),
    ]);
    fireEvent.click(screen.getByRole('button', { name: /keep/i }));
    await waitFor(() => {
      expect(mockDismiss).toHaveBeenCalledWith({ consumptionId: 'c-1' });
    });
    expect(mockVoid).not.toHaveBeenCalled();
  });

  it('does not dismiss when the void fails (so the banner stays for retry)', async () => {
    mockVoid.mockResolvedValueOnce({ ok: false, code: 'FORBIDDEN' });
    renderBanner([
      row({ consumptionId: 'c-1', loggerDisplayName: 'Pavel', beerName: 'Kozel' }),
    ]);
    fireEvent.click(screen.getByRole('button', { name: /reverse/i }));
    await waitFor(() => expect(mockVoid).toHaveBeenCalledOnce());
    expect(mockDismiss).not.toHaveBeenCalled();
  });

  // Spec 026 — logger avatar renders inline before the message.
  describe('logger avatar (spec 026)', () => {
    it('renders the logger avatar when loggerMemberId + avatar fields are set', () => {
      const { container } = renderBanner([
        row({
          consumptionId: 'c-1',
          loggerDisplayName: 'Pavel',
          beerName: 'Kozel',
          loggerMemberId: 'logger-m-1',
          loggerAvatarKey: 'star',
          loggerAvatarUploadAt: null,
        }),
      ]);
      // MemberAvatar's wrapper has the bg-primary/15 chip class.
      expect(container.querySelector('span.bg-primary\\/15')).toBeInTheDocument();
      // Existing message text still renders.
      expect(screen.getByText(/pavel logged for you: kozel/i)).toBeInTheDocument();
    });

    it('skips the avatar entirely when loggerMemberId is null (defensive)', () => {
      const { container } = renderBanner([
        row({ consumptionId: 'c-1', loggerDisplayName: 'Pavel', beerName: 'Kozel' }),
      ]);
      expect(container.querySelector('span.bg-primary\\/15')).not.toBeInTheDocument();
      // The existing Beer icon still renders.
      expect(container.querySelector('svg')).toBeInTheDocument();
    });
  });
});

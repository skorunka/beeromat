import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { RecordResultForm } from '@/app/[locale]/(app)/match/[agreementId]/RecordResultForm';
import enMessages from '@/messages/en.json';

// Spec 030 — RecordResultForm no longer picks a beer (chosen at create,
// overridable at delivery). It just records who won; recording creates
// pending IOUs, not settlement.

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

function renderForm(opts: { forBeer?: boolean; loserBeerCount?: number } = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <RecordResultForm
        agreementId="agreement-1"
        sideALabel="Side A"
        sideBLabel="Side B"
        forBeer={opts.forBeer ?? true}
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

describe('RecordResultForm — spec 030', () => {
  it('renders both win buttons; no beer picker', () => {
    renderForm();
    expect(screen.getByRole('button', { name: /Side A/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Side B/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Auto/i })).not.toBeInTheDocument();
  });

  it('for-beer match shows the "loser buys" explainer', () => {
    renderForm({ forBeer: true, loserBeerCount: 2 });
    expect(screen.getByText(/whoever loses buys 2× beer/i)).toBeInTheDocument();
  });

  it('friendly match shows no explainer', () => {
    renderForm({ forBeer: false });
    expect(screen.queryByText(/whoever loses buys/i)).not.toBeInTheDocument();
  });

  it('recording sends only agreementId + winningSide (no override)', async () => {
    mockRecordResultAction.mockResolvedValue({ ok: true, matchRowIds: ['m-1'], debtsCreated: 1 });
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: /Side A/i }));
    await waitFor(() => expect(mockRecordResultAction).toHaveBeenCalledTimes(1));
    const payload = mockRecordResultAction.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload).toEqual({ agreementId: 'agreement-1', winningSide: 'A' });
  });
});

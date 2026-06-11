import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { SeriesForm } from '@/components/events/series-form';
import enMessages from '@/messages/en.json';

const mockRefresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mockCreate = vi.fn();
vi.mock('@/app/[locale]/(app)/events/actions', () => ({
  createSeriesAction: (...a: unknown[]) => mockCreate(...a),
}));

beforeEach(() => {
  mockRefresh.mockReset();
  mockCreate.mockReset();
});

function renderForm() {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <SeriesForm />
    </NextIntlClientProvider>,
  );
}

describe('SeriesForm', () => {
  it('submits weekday/time/place to createSeriesAction', async () => {
    mockCreate.mockResolvedValue({ ok: true, seriesId: 's1' });
    renderForm();
    fireEvent.change(screen.getByPlaceholderText('Clay court'), { target: { value: 'Antuka' } });
    fireEvent.click(screen.getByRole('button', { name: /create/i }));
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ weekday: 2, startLocalTime: '17:00', placeLabel: 'Antuka' }),
      );
    });
  });

  it('blocks submit when place is empty (in-app validation)', async () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: /create/i }));
    await waitFor(() => {
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });
});

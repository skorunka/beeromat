import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { LogOnBehalfForm } from '@/components/log/log-on-behalf-form';
import enMessages from '@/messages/en.json';
import type { MemberOption } from '@/components/picker/types';

// Spec 024 T008 — wiring smoke test for the on-behalf form.
// Confirms the new tile-grid member picker correctly feeds
// `targetMemberId` into the existing `logBeerOnBehalfAction`.

const mockLogBeerOnBehalfAction = vi.fn();
vi.mock('@/app/[locale]/(app)/log/actions', () => ({
  logBeerOnBehalfAction: (...args: unknown[]) => mockLogBeerOnBehalfAction(...args),
}));

const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));

const mockCelebrateBeer = vi.fn();
vi.mock('@/lib/celebrate', () => ({
  celebrateBeer: () => mockCelebrateBeer(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const seedMembers: MemberOption[] = [
  { id: 'm-1', displayName: 'Pavel', avatarKey: null, avatarUploadAt: null },
  { id: 'm-2', displayName: 'Tereza', avatarKey: 'star', avatarUploadAt: null },
];
const seedBeers = [
  { id: 'b-1', name: 'Pilsner', currentStock: 5 },
  { id: 'b-2', name: 'Stout', currentStock: 3 },
];

function renderForm() {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <LogOnBehalfForm members={seedMembers} beers={seedBeers} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  mockLogBeerOnBehalfAction.mockReset();
  mockToastError.mockReset();
  mockToastSuccess.mockReset();
  mockCelebrateBeer.mockReset();
});

describe('LogOnBehalfForm wiring (spec 024)', () => {
  it('renders a member tile grid (not a <select>) for the member picker', () => {
    const { container } = renderForm();
    expect(container.querySelector('select')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /pavel/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /tereza/i })).toBeInTheDocument();
  });

  it('submit calls logBeerOnBehalfAction with the picked member + beer', async () => {
    mockLogBeerOnBehalfAction.mockResolvedValue({ ok: true });
    renderForm();

    // Pick member tile + beer tile.
    fireEvent.click(screen.getByRole('radio', { name: /tereza/i }));
    fireEvent.click(screen.getByRole('button', { name: /^pilsner$/i }));

    // Submit (the submit button's label is contextual; grab the
    // last enabled non-tile button).
    const buttons = screen.getAllByRole('button').filter((b) => {
      const role = b.getAttribute('role');
      const dataDisabled = (b as HTMLButtonElement).disabled;
      return role !== 'radio' && !dataDisabled;
    });
    const submitBtn = buttons[buttons.length - 1]!;
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockLogBeerOnBehalfAction).toHaveBeenCalledWith({
        beerTypeId: 'b-1',
        targetMemberId: 'm-2',
      });
    });
  });
});

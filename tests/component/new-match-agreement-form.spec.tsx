import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect, vi } from 'vitest';

import { NewMatchAgreementForm } from '@/app/[locale]/(app)/match/NewMatchAgreementForm';
import type { MemberOption } from '@/components/picker/types';
import type { BeerPickerOption } from '@/components/picker/beer-picker-dropdown';
import enMessages from '@/messages/en.json';

// Spec 030 T025 — the bet-beer picker on the create form is shown only
// for a for-beer match.

vi.mock('@/app/[locale]/(app)/match/actions', () => ({ createAgreementAction: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const members: MemberOption[] = [
  { id: 'm-1', displayName: 'Alice', avatarKey: null, avatarUploadAt: null },
  { id: 'm-2', displayName: 'Bob', avatarKey: null, avatarUploadAt: null },
];
const beers: BeerPickerOption[] = [
  { id: 'b-1', name: 'Pilsner', unitPriceMinor: 4000n, currentStock: 10 },
];

function renderForm() {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <NewMatchAgreementForm members={members} beers={beers} currencyCode="CZK" locale="en" />
    </NextIntlClientProvider>,
  );
}

describe('NewMatchAgreementForm — bet beer picker (spec 030)', () => {
  it('shows the beer picker by default (for-beer is on)', () => {
    renderForm();
    // Label + dropdown placeholder both carry the text → at least one.
    expect(screen.getAllByText(enMessages.match.betBeerLabel).length).toBeGreaterThan(0);
  });

  it('hides the beer picker when switched to Friendly', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: enMessages.match.forBeerNo }));
    expect(screen.queryAllByText(enMessages.match.betBeerLabel)).toHaveLength(0);
  });
});

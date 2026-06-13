import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: unknown; children: React.ReactNode }) => (
    <a href={String(href)} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/app/[locale]/(app)/match/actions', () => ({
  deliverBeerDebtAction: vi.fn(),
  undeliverBeerDebtAction: vi.fn(),
  voidBeerDebtAction: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/lib/celebrate', () => ({ celebrateBeer: vi.fn() }));

import { BeerIouRow } from '@/components/match/beer-iou-row';
import { ConfirmProvider } from '@/components/ui/confirm-dialog';
import type { BeerDebtRow } from '@/lib/db/queries/match-bet-debts';
import enMessages from '@/messages/en.json';

// Spec 036 — the IOU counterparty (avatar + name) links to their profile; the
// deliver/write-off controls stay siblings (no nested anchors).

function debt(over: Partial<BeerDebtRow> = {}): BeerDebtRow {
  return {
    debtId: 'd-1',
    agreementId: 'a-1',
    counterpartyMemberId: 'm-2',
    counterpartyName: 'Pepa',
    counterpartyAvatarKey: null,
    counterpartyAvatarUploadAt: null,
    plannedBeerTypeId: 'b-1',
    plannedBeerName: 'Pilsner',
    beerCount: 1,
    createdAt: new Date('2026-06-01T18:00:00Z'),
    ...over,
  } as BeerDebtRow;
}

function renderRow(role: 'owed' | 'owe' = 'owe') {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ConfirmProvider>
        <BeerIouRow
          debt={debt()}
          role={role}
          beers={[]}
          currencyCode="CZK"
          locale="en"
          now={new Date('2026-06-02T18:00:00Z')}
        />
      </ConfirmProvider>
    </NextIntlClientProvider>,
  );
}

describe('BeerIouRow (component — spec 036)', () => {
  it('links the counterparty (avatar + name) to their profile', () => {
    renderRow('owe');
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', expect.stringContaining('/members/m-2'));
    expect(link).toHaveTextContent(/pepa/i);
  });

  it('keeps the deliver control as a sibling button (not nested in the link)', () => {
    renderRow('owe');
    const deliver = screen.getByRole('button', { name: /delivered/i });
    expect(deliver).toBeInTheDocument();
    // The deliver control must NOT live inside the profile link (no nested <a>).
    expect(deliver.closest('a')).toBeNull();
  });
});

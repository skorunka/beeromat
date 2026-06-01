import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect } from 'vitest';

import { TabBeerBreakdown } from '@/components/tab/tab-beer-breakdown';
import type { BeerBreakdownGroup } from '@/lib/tab/group-beer-breakdown';
import enMessages from '@/messages/en.json';

function renderBreakdown(groups: BeerBreakdownGroup[], locale: 'en' | 'cs' = 'en') {
  return render(
    <NextIntlClientProvider locale={locale} messages={enMessages}>
      <TabBeerBreakdown groups={groups} currencyCode="CZK" locale={locale} />
    </NextIntlClientProvider>,
  );
}

function group(over: Partial<BeerBreakdownGroup> = {}): BeerBreakdownGroup {
  return {
    beerTypeName: 'Pilsner Urquell',
    dayKey: '2026-06-01',
    representativeDate: new Date('2026-06-01T18:00:00Z'),
    origin: 'drank',
    count: 3,
    subtotalMinor: 12000n,
    ...over,
  };
}

describe('TabBeerBreakdown', () => {
  it('renders a row per group with name, count, and subtotal', () => {
    renderBreakdown([
      group({ beerTypeName: 'Pilsner Urquell', count: 3, subtotalMinor: 12000n }),
      group({ beerTypeName: 'Bernard 10°', count: 2, subtotalMinor: 6000n }),
    ]);
    expect(screen.getByText('Pilsner Urquell')).toBeInTheDocument();
    expect(screen.getByText('×3')).toBeInTheDocument();
    expect(screen.getByText('Bernard 10°')).toBeInTheDocument();
    expect(screen.getByText('×2')).toBeInTheDocument();
    // Whole amounts → adaptive precision drops decimals (en CZK → "CZK 120").
    expect(screen.getByText(/CZK[\s ]?120$/)).toBeInTheDocument();
    expect(screen.getByText(/CZK[\s ]?60$/)).toBeInTheDocument();
    // Grand total is shown prominently in the heading row (180).
    expect(screen.getByText(/CZK[\s ]?180$/)).toBeInTheDocument();
  });

  it('renders the section heading', () => {
    renderBreakdown([group()]);
    expect(screen.getByText(enMessages.tab.breakdown.heading)).toBeInTheDocument();
  });

  it('always shows a day header (weekday + date)', () => {
    const { container } = renderBreakdown([
      group({ representativeDate: new Date('2026-06-01T18:00:00Z') }), // Monday Jun 1
    ]);
    expect(container.textContent).toMatch(/Monday/);
  });

  it('renders separate day sections, newest first', () => {
    const { container } = renderBreakdown([
      group({ dayKey: '2026-06-03', representativeDate: new Date('2026-06-03T18:00:00Z'), beerTypeName: 'Pilsner' }),
      group({ dayKey: '2026-06-01', representativeDate: new Date('2026-06-01T18:00:00Z'), beerTypeName: 'Bernard' }),
    ]);
    expect(container.textContent).toMatch(/Wednesday/); // Jun 3
    expect(container.textContent).toMatch(/Monday/); // Jun 1
  });

  it('marks a lost-bet group with the lost-bet note', () => {
    renderBreakdown([
      group({ beerTypeName: 'Pilsner', origin: 'drank', count: 2, subtotalMinor: 8000n }),
      group({ beerTypeName: 'Pilsner', origin: 'lost_bet', count: 1, subtotalMinor: 4000n }),
    ]);
    expect(screen.getByText(new RegExp(enMessages.tab.breakdown.lostBet, 'i'))).toBeInTheDocument();
  });

  it('does not mark drank-only groups with the lost-bet note', () => {
    renderBreakdown([group({ origin: 'drank' })]);
    expect(screen.queryByText(new RegExp(enMessages.tab.breakdown.lostBet, 'i'))).toBeNull();
  });

  it('renders a single-group breakdown (count 1)', () => {
    renderBreakdown([group({ beerTypeName: 'Kozel', count: 1, subtotalMinor: 3500n })]);
    expect(screen.getByText('Kozel')).toBeInTheDocument();
    expect(screen.getByText('×1')).toBeInTheDocument();
  });

  it('renders nothing when there are no groups', () => {
    const { container } = renderBreakdown([]);
    expect(container).toBeEmptyDOMElement();
  });
});

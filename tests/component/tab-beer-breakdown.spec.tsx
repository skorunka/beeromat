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
    // en locale + CZK renders "CZK 120.00".
    expect(screen.getByText(/120\.00/)).toBeInTheDocument();
    expect(screen.getByText(/60\.00/)).toBeInTheDocument();
  });

  it('renders the section heading', () => {
    renderBreakdown([group()]);
    expect(screen.getByText(enMessages.tab.breakdown.heading)).toBeInTheDocument();
  });

  it('summed subtotals equal the grand total (180 Kč)', () => {
    const groups = [
      group({ beerTypeName: 'Pilsner', count: 3, subtotalMinor: 12000n }),
      group({ beerTypeName: 'Bernard', count: 2, subtotalMinor: 6000n }),
    ];
    renderBreakdown(groups);
    expect(groups.reduce((a, g) => a + g.subtotalMinor, 0n)).toBe(18000n);
  });

  it('renders a single-group breakdown (count 1)', () => {
    renderBreakdown([group({ beerTypeName: 'Kozel', count: 1, subtotalMinor: 3500n })]);
    expect(screen.getByText('Kozel')).toBeInTheDocument();
    expect(screen.getByText('×1')).toBeInTheDocument();
  });

  it('shows per-day sub-headings only when the round spans multiple days', () => {
    const { container } = renderBreakdown([
      group({ dayKey: '2026-06-02', representativeDate: new Date('2026-06-02T18:00:00Z'), beerTypeName: 'Pilsner' }),
      group({ dayKey: '2026-06-01', representativeDate: new Date('2026-06-01T18:00:00Z'), beerTypeName: 'Bernard' }),
    ]);
    expect(container.textContent).toMatch(/Jun 2, 2026/);
    expect(container.textContent).toMatch(/Jun 1, 2026/);
  });

  it('renders nothing when there are no groups', () => {
    const { container } = renderBreakdown([]);
    expect(container).toBeEmptyDOMElement();
  });
});

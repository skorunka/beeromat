import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect, vi } from 'vitest';

import { TabEntryRow } from '@/components/tab/tab-entry-row';
import enMessages from '@/messages/en.json';
import csMessages from '@/messages/cs.json';
import type { MemberTabEntry } from '@/lib/db/queries/consumption';

// Spec 019 T027 — component test for the four-variant tab row.

vi.mock('@/lib/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// UndoButton is a client component invoking an action — stub it.
vi.mock('@/components/log/undo-button', () => ({
  UndoButton: ({ consumptionId }: { consumptionId: string }) => (
    <button type="button" data-undo={consumptionId}>
      undo
    </button>
  ),
}));

const baseEntry: MemberTabEntry = {
  id: 'c-1',
  kind: 'consumption',
  beerTypeName: 'Pilsner',
  unitPriceMinor: 5000n,
  createdAt: new Date('2026-05-26T15:00:00Z'),
  voided: false,
  canUndo: false,
  sourceMatchId: null,
  loggerDisplayName: null,
};

function renderRow(entry: MemberTabEntry, locale: 'cs' | 'en' = 'en') {
  const messages = locale === 'en' ? enMessages : csMessages;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <ul>
        <TabEntryRow entry={entry} currencyCode="CZK" locale={locale} />
      </ul>
    </NextIntlClientProvider>,
  );
}

describe('TabEntryRow (component layer — spec 019)', () => {
  it('self-logged consumption: no badge, no logger subtitle', () => {
    renderRow(baseEntry);
    expect(screen.getByText('Pilsner')).toBeInTheDocument();
    expect(screen.queryByText(/by /i)).not.toBeInTheDocument();
    expect(screen.queryByText(/from the match/i)).not.toBeInTheDocument();
  });

  it('on-behalf consumption: shows "by {logger}" subtitle', () => {
    renderRow({ ...baseEntry, loggerDisplayName: 'Pavel' });
    expect(screen.getByText('Pilsner')).toBeInTheDocument();
    expect(screen.getByText(/by pavel/i)).toBeInTheDocument();
  });

  it('on-behalf consumption (cs): shows "od {logger}"', () => {
    renderRow({ ...baseEntry, loggerDisplayName: 'Pavel' }, 'cs');
    expect(screen.getByText(/od pavel/i)).toBeInTheDocument();
  });

  it('won-bet consumption: shows "from the match →" subtitle linking to /match/{id}', () => {
    renderRow({ ...baseEntry, sourceMatchId: 'm-9' });
    const link = screen.getByRole('link', { name: /from the match/i });
    expect(link).toHaveAttribute('href', '/match/m-9');
  });

  it('lost-bet transfer_in: shows "lost bet: {logger} · {beer}" as primary line', () => {
    renderRow({
      ...baseEntry,
      id: 't-1',
      kind: 'transfer_in',
      loggerDisplayName: 'Pavel',
      sourceMatchId: 'm-9',
    });
    expect(screen.getByText(/lost bet: pavel · pilsner/i)).toBeInTheDocument();
    // The plain "Pilsner" heading from a self-row should NOT appear.
    expect(screen.queryByRole('heading', { name: 'Pilsner' })).not.toBeInTheDocument();
  });

  it('lost-bet transfer_in (cs): "z prohrané sázky: Pavel · Pilsner"', () => {
    renderRow(
      {
        ...baseEntry,
        id: 't-1',
        kind: 'transfer_in',
        loggerDisplayName: 'Pavel',
        sourceMatchId: 'm-9',
      },
      'cs',
    );
    expect(screen.getByText(/z prohrané sázky: pavel · pilsner/i)).toBeInTheDocument();
  });

  it('voided consumption: shows the voided badge + applies the dim style', () => {
    const { container } = renderRow({ ...baseEntry, voided: true });
    expect(screen.getByText(/scrapped/i)).toBeInTheDocument();
    expect(container.querySelector('li')?.className).toMatch(/opacity-50/);
  });

  it('canUndo: renders the UndoButton', () => {
    renderRow({ ...baseEntry, canUndo: true });
    expect(screen.getByRole('button', { name: /undo/i })).toBeInTheDocument();
  });
});

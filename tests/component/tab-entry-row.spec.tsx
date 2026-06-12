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
  loggerMemberId: null,
  loggerAvatarKey: null,
  loggerAvatarUploadAt: null,
  fromRound: false,
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

  it('round consumption: shows the "Round" badge alongside the logger', () => {
    renderRow({ ...baseEntry, fromRound: true, loggerDisplayName: 'Franta' });
    expect(screen.getByText(/Round/)).toBeInTheDocument();
    expect(screen.getByText(/by franta/i)).toBeInTheDocument();
  });

  it('round consumption (cs): shows "Runda"', () => {
    renderRow({ ...baseEntry, fromRound: true, loggerDisplayName: 'Franta' }, 'cs');
    expect(screen.getByText(/Runda/)).toBeInTheDocument();
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

  it('won-bet transfer_out: shows "won bet: {logger} pays · {beer}" with a struck-through price', () => {
    const { container } = renderRow({
      ...baseEntry,
      id: 'c-won',
      kind: 'transfer_out',
      loggerDisplayName: 'Bob',
      sourceMatchId: 'm-9',
    });
    expect(screen.getByText(/won bet: bob pays · pilsner/i)).toBeInTheDocument();
    // Price shown but struck through (it's a credit, not a charge).
    const strike = container.querySelector('.line-through');
    expect(strike).toBeInTheDocument();
    // No undo affordance on a transfer row.
    expect(screen.queryByRole('button', { name: /undo/i })).not.toBeInTheDocument();
  });

  it('won-bet transfer_out (cs): "z vyhrané sázky: platí Bob · Pilsner"', () => {
    renderRow(
      {
        ...baseEntry,
        id: 'c-won',
        kind: 'transfer_out',
        loggerDisplayName: 'Bob',
        sourceMatchId: 'm-9',
      },
      'cs',
    );
    expect(screen.getByText(/z vyhrané sázky: platí bob · pilsner/i)).toBeInTheDocument();
  });

  it('voided consumption: shows the voided badge + applies the dim style', () => {
    const { container } = renderRow({ ...baseEntry, voided: true });
    expect(screen.getByText(/scrapped/i)).toBeInTheDocument();
    // The dim style now lives on the Card inside the <li>.
    expect(container.querySelector('[data-slot="card"]')?.className).toMatch(/opacity-50/);
  });

  it('canUndo: renders the UndoButton', () => {
    renderRow({ ...baseEntry, canUndo: true });
    expect(screen.getByRole('button', { name: /undo/i })).toBeInTheDocument();
  });

  // Spec 023 — logger avatar on the on-behalf attribution subtitle.
  describe('on-behalf avatar (spec 023)', () => {
    it('renders <img> next to "by X" when logger has an upload', () => {
      const { container } = renderRow({
        ...baseEntry,
        loggerDisplayName: 'Pavel',
        loggerMemberId: 'logger-m-1',
        loggerAvatarKey: null,
        loggerAvatarUploadAt: new Date('2026-05-01T12:00:00Z'),
      });
      expect(container.querySelector('img')).toBeInTheDocument();
      expect(screen.getByText(/by pavel/i)).toBeInTheDocument();
    });

    it('renders the glyph SVG next to "by X" when logger has avatarKey', () => {
      const { container } = renderRow({
        ...baseEntry,
        loggerDisplayName: 'Pavel',
        loggerMemberId: 'logger-m-1',
        loggerAvatarKey: 'star',
        loggerAvatarUploadAt: null,
      });
      // Two svgs is acceptable (glyph + possibly the link arrow icon),
      // but at minimum the row must carry at least one svg now.
      expect(container.querySelector('svg')).toBeInTheDocument();
      expect(screen.getByText(/by pavel/i)).toBeInTheDocument();
    });

    it('renders initials chip next to "by X" when logger has neither', () => {
      renderRow({
        ...baseEntry,
        loggerDisplayName: 'Pavel',
        loggerMemberId: 'logger-m-1',
        loggerAvatarKey: null,
        loggerAvatarUploadAt: null,
      });
      // Initials of 'Pavel' = 'PA'
      expect(screen.getByText('PA')).toBeInTheDocument();
      expect(screen.getByText(/by pavel/i)).toBeInTheDocument();
    });

    it('self-logged consumption: no avatar (FR-006 — only on-behalf gets one)', () => {
      const { container } = renderRow(baseEntry);
      expect(container.querySelector('img')).not.toBeInTheDocument();
      // No avatar wrapper span has its bg-primary/15 class on a self row.
      expect(container.querySelector('span.bg-primary\\/15')).not.toBeInTheDocument();
    });

    it('lost-bet transfer_in row: no avatar (FR-006 — only on-behalf gets one)', () => {
      const { container } = renderRow({
        ...baseEntry,
        id: 't-1',
        kind: 'transfer_in',
        loggerDisplayName: 'Pavel',
        sourceMatchId: 'm-9',
      });
      expect(container.querySelector('img')).not.toBeInTheDocument();
      expect(container.querySelector('span.bg-primary\\/15')).not.toBeInTheDocument();
    });
  });
});

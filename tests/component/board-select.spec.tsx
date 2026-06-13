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

import { BoardSelect } from '@/components/stats/board-select';
import enMessages from '@/messages/en.json';

// Spec 034 follow-up — the chip-strip switcher. Server-rendered Links; the active
// chip carries aria-current, every chip links to ?board= (preserving scope).

function renderStrip(current: Parameters<typeof BoardSelect>[0]['current'], scope: 'allTime' | 'season' = 'allTime') {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <BoardSelect current={current} scope={scope} />
    </NextIntlClientProvider>,
  );
}

describe('BoardSelect (component — spec 034 follow-up)', () => {
  it('renders one chip per board (all 8 visible)', () => {
    renderStrip('beers');
    expect(screen.getAllByRole('link')).toHaveLength(8);
    expect(screen.getByRole('link', { name: /Most beers/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Most generous/i })).toBeInTheDocument();
    // Spec 037 — the new 🏅 badges chip links to ?board=badges.
    const badges = screen.getByRole('link', { name: /Most badges/i });
    expect(badges).toHaveAttribute('href', expect.stringContaining('board=badges'));
  });

  it('marks the current board active and links each chip to its ?board=', () => {
    renderStrip('beers');
    expect(screen.getByRole('link', { name: /Most beers/i })).toHaveAttribute('aria-current', 'true');
    const wins = screen.getByRole('link', { name: /Most wins/i });
    expect(wins).not.toHaveAttribute('aria-current');
    expect(wins).toHaveAttribute('href', expect.stringContaining('board=wins'));
  });

  it('preserves season scope in every chip href', () => {
    renderStrip('beers', 'season');
    expect(screen.getByRole('link', { name: /Most wins/i })).toHaveAttribute(
      'href',
      expect.stringContaining('scope=season'),
    );
  });
});

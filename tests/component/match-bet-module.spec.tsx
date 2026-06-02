import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect, vi } from 'vitest';

import { MatchBetModule } from '@/components/home/match-bet-module';
import enMessages from '@/messages/en.json';
import csMessages from '@/messages/cs.json';

// Spec 018 T020 + usability follow-up (2026-05-28) — home bet-
// awareness module, now both directions (lost + won).

vi.mock('@/lib/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function renderModule(
  props: {
    betCount: number;
    sourceMatchIds: string[];
    wonCount?: number;
    wonMatchIds?: string[];
    wonPayerName?: string | null;
  },
  locale: 'cs' | 'en' = 'en',
) {
  const messages = locale === 'en' ? enMessages : csMessages;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <MatchBetModule
        betCount={props.betCount}
        sourceMatchIds={props.sourceMatchIds}
        wonCount={props.wonCount ?? 0}
        wonMatchIds={props.wonMatchIds ?? []}
        wonPayerName={props.wonPayerName ?? null}
      />
    </NextIntlClientProvider>,
  );
}

describe('MatchBetModule (component layer)', () => {
  it('renders nothing when both betCount and wonCount are 0', () => {
    const { container } = renderModule({ betCount: 0, sourceMatchIds: [] });
    expect(container.firstChild).toBeNull();
  });

  it('loser single match: renders the tab line + reverse link to /match/{id}', () => {
    renderModule({ betCount: 1, sourceMatchIds: ['m-1'] }, 'en');
    expect(screen.getByText(/from today's match: 1× beer on your tab/i)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /reverse match/i });
    expect(link).toHaveAttribute('href', '/match/m-1');
  });

  it('loser Czech variant', () => {
    renderModule({ betCount: 2, sourceMatchIds: ['m-1'] }, 'cs');
    expect(screen.getByText(/z dnešního zápasu: 2× pivo na tvé útratě/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /vrátit zápas/i })).toBeInTheDocument();
  });

  it('loser multi-match: matches list link to /match', () => {
    renderModule({ betCount: 3, sourceMatchIds: ['m-1', 'm-2'] }, 'en');
    expect(screen.getByText(/from today's matches: 3× beer on your tab/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view matches/i })).toHaveAttribute('href', '/match');
  });

  it('winner: renders the "you won" line + view link', () => {
    renderModule({ betCount: 0, sourceMatchIds: [], wonCount: 1, wonMatchIds: ['m-9'] }, 'en');
    expect(screen.getByText(/you won — 1× beer on the house tonight/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view match/i })).toHaveAttribute('href', '/match/m-9');
  });

  it('winner with a named payer: shows who is buying', () => {
    renderModule(
      { betCount: 0, sourceMatchIds: [], wonCount: 1, wonMatchIds: ['m-9'], wonPayerName: 'Pepa' },
      'en',
    );
    expect(screen.getByText(/you won — pepa is buying 1× beer/i)).toBeInTheDocument();
  });

  it('winner + loser together: both lines render', () => {
    renderModule(
      { betCount: 1, sourceMatchIds: ['m-1'], wonCount: 2, wonMatchIds: ['m-9'] },
      'en',
    );
    expect(screen.getByText(/you won — 2× beer on the house tonight/i)).toBeInTheDocument();
    expect(screen.getByText(/from today's match: 1× beer on your tab/i)).toBeInTheDocument();
  });
});

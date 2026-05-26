import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect, vi } from 'vitest';

import { MatchBetModule } from '@/components/home/match-bet-module';
import enMessages from '@/messages/en.json';
import csMessages from '@/messages/cs.json';

// Spec 018 T020 — component test for the home bet-awareness
// module. Covers the three render variants from
// contracts/home-module.md.

// Mock i18n Link as a plain anchor.
vi.mock('@/lib/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function renderModule(
  props: { betCount: number; sourceMatchIds: string[] },
  locale: 'cs' | 'en' = 'en',
) {
  const messages = locale === 'en' ? enMessages : csMessages;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <MatchBetModule {...props} />
    </NextIntlClientProvider>,
  );
}

describe('MatchBetModule (component layer — spec 018)', () => {
  it('V1 — renders nothing when betCount is 0', () => {
    const { container } = renderModule({ betCount: 0, sourceMatchIds: [] });
    expect(container.firstChild).toBeNull();
  });

  it('V2 — single match: renders "From today\'s match: 1× beer" + reverse link', () => {
    renderModule({ betCount: 1, sourceMatchIds: ['m-1'] }, 'en');
    expect(screen.getByText(/from today's match: 1× beer/i)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /reverse match/i });
    expect(link).toHaveAttribute('href', '/match/m-1');
  });

  it('V2 — Czech variant: "Útrata z dnešního zápasu: 2× pivo"', () => {
    renderModule({ betCount: 2, sourceMatchIds: ['m-1'] }, 'cs');
    expect(screen.getByText(/útrata z dnešního zápasu: 2× pivo/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /vrátit zápas/i })).toBeInTheDocument();
  });

  it('V3 — multi-match: renders "From today\'s matches: 3× beer" + matches list link', () => {
    renderModule({ betCount: 3, sourceMatchIds: ['m-1', 'm-2'] }, 'en');
    expect(screen.getByText(/from today's matches: 3× beer/i)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /view matches/i });
    expect(link).toHaveAttribute('href', '/match');
  });
});

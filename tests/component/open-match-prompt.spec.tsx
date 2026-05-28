import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect, vi } from 'vitest';

import { OpenMatchPrompt } from '@/components/home/open-match-prompt';
import enMessages from '@/messages/en.json';
import csMessages from '@/messages/cs.json';

vi.mock('@/lib/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function renderPrompt(
  matches: { id: string; sideA: string; sideB: string }[],
  locale: 'cs' | 'en' = 'en',
) {
  const messages = locale === 'en' ? enMessages : csMessages;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <OpenMatchPrompt matches={matches} />
    </NextIntlClientProvider>,
  );
}

describe('OpenMatchPrompt', () => {
  it('renders nothing with no open matches', () => {
    const { container } = renderPrompt([]);
    expect(container.firstChild).toBeNull();
  });

  it('single match: names both sides + deep-links to /match/{id}', () => {
    renderPrompt([{ id: 'a-1', sideA: 'Mara', sideB: 'Honza' }]);
    expect(screen.getByText(/match to settle: mara vs honza/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /record the result/i })).toHaveAttribute(
      'href',
      '/match/a-1',
    );
  });

  it('multiple matches: aggregates + links to the hub', () => {
    renderPrompt([
      { id: 'a-1', sideA: 'Mara', sideB: 'Honza' },
      { id: 'a-2', sideA: 'Eva', sideB: 'Pavel' },
    ]);
    expect(screen.getByText(/2 matches waiting for a result/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go to matches/i })).toHaveAttribute('href', '/match');
  });

  it('Czech single-match copy', () => {
    renderPrompt([{ id: 'a-1', sideA: 'Mara', sideB: 'Honza' }], 'cs');
    expect(screen.getByText(/zápas k vyhodnocení: mara vs honza/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /zapsat výsledek/i })).toBeInTheDocument();
  });
});

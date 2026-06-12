import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect, vi } from 'vitest';

import { OpenMatchPrompt, type OpenMatchSummary } from '@/components/home/open-match-prompt';
import enMessages from '@/messages/en.json';
import csMessages from '@/messages/cs.json';

vi.mock('@/lib/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// Minimal player factory — avatar fields null so MemberAvatar falls back
// to initials (no image fetch in jsdom).
const p = (displayName: string): OpenMatchSummary['sideA'][number] => ({
  memberId: `m-${displayName}`,
  displayName,
  avatarKey: null,
  avatarUploadAt: null,
});

function renderPrompt(matches: OpenMatchSummary[], locale: 'cs' | 'en' = 'en') {
  const messages = locale === 'en' ? enMessages : csMessages;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <OpenMatchPrompt matches={matches} />
    </NextIntlClientProvider>,
  );
}

const single: OpenMatchSummary[] = [
  { id: 'a-1', forBeer: false, sideA: [p('Mara')], sideB: [p('Honza')] },
];

describe('OpenMatchPrompt', () => {
  it('renders nothing with no open matches', () => {
    const { container } = renderPrompt([]);
    expect(container.firstChild).toBeNull();
  });

  it('single match: heading + both team names + deep-links to /match/{id}', () => {
    renderPrompt(single);
    expect(screen.getByText(/match to record/i)).toBeInTheDocument();
    expect(screen.getByText('Mara')).toBeInTheDocument();
    expect(screen.getByText('Honza')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /record the result/i })).toHaveAttribute(
      'href',
      '/match/a-1',
    );
  });

  it('shows the "for beer" badge only when the match is for beer', () => {
    const { rerender } = renderPrompt(single);
    expect(screen.queryByText(/for beer/i)).not.toBeInTheDocument();
    rerender(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <OpenMatchPrompt matches={[{ ...single[0]!, forBeer: true }]} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText(/for beer/i)).toBeInTheDocument();
  });

  it('multiple matches: aggregates + links to the hub', () => {
    renderPrompt([
      { id: 'a-1', forBeer: false, sideA: [p('Mara')], sideB: [p('Honza')] },
      { id: 'a-2', forBeer: false, sideA: [p('Eva')], sideB: [p('Pavel')] },
    ]);
    expect(screen.getByText(/2 matches waiting for a result/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go to matches/i })).toHaveAttribute('href', '/match');
  });

  it('Czech plural is grammatical: 2 → "zápasy čekají", 5 → "zápasů čeká"', () => {
    const mk = (n: number): OpenMatchSummary[] =>
      Array.from({ length: n }, (_, i) => ({
        id: `a-${i}`,
        forBeer: false,
        sideA: [p(`A${i}`)],
        sideB: [p(`B${i}`)],
      }));
    const { rerender } = renderPrompt(mk(2), 'cs');
    expect(screen.getByText(/2 zápasy čekají na výsledek/i)).toBeInTheDocument();
    rerender(
      <NextIntlClientProvider locale="cs" messages={csMessages}>
        <OpenMatchPrompt matches={mk(5)} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText(/5 zápasů čeká na výsledek/i)).toBeInTheDocument();
  });
});

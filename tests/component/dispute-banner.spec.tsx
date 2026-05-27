import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';

import { DisputeBanner } from '@/components/dispute-banner';
import csMessages from '@/messages/cs.json';

// Stub @/lib/i18n/navigation directly — its createNavigation()
// import chain doesn't resolve cleanly under jsdom. Same pattern
// used by tab-entry-row.spec.tsx and match-bet-module.spec.tsx.
vi.mock('@/lib/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const STORAGE_KEY = 'beeromat:dismissed-disputes';

function renderBanner(claims: Parameters<typeof DisputeBanner>[0]['claims']) {
  return render(
    <NextIntlClientProvider locale="cs" messages={csMessages}>
      <DisputeBanner claims={claims} />
    </NextIntlClientProvider>,
  );
}

describe('DisputeBanner', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders nothing when there are no claims', () => {
    const { container } = renderBanner([]);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders one card per dispute', () => {
    renderBanner([
      { paymentId: 'a', amountDisplay: '120 Kč', reason: null },
      { paymentId: 'b', amountDisplay: '240 Kč', reason: null },
    ]);
    expect(screen.getAllByRole('link').length).toBe(2); // two "settle" links
  });

  it('renders the with-reason copy when a reason is present', () => {
    renderBanner([
      { paymentId: 'a', amountDisplay: '120 Kč', reason: 'wrong VS' },
    ]);
    // Czech catalog: dispute.bannerWithReason includes {reason}.
    expect(screen.getByText(/wrong VS/)).toBeInTheDocument();
  });

  it('renders the no-reason copy when reason is null', () => {
    renderBanner([
      { paymentId: 'a', amountDisplay: '120 Kč', reason: null },
    ]);
    // Should NOT contain a reason fragment that only appears in bannerWithReason.
    expect(screen.queryByText(/wrong VS/)).toBeNull();
  });

  it('dismiss hides that claim AND persists to localStorage', () => {
    renderBanner([
      { paymentId: 'a', amountDisplay: '120 Kč', reason: null },
    ]);
    const dismissBtn = screen.getByRole('button');
    fireEvent.click(dismissBtn);
    // Claim is hidden — the only link/button in the banner is gone.
    expect(screen.queryByRole('button')).toBeNull();
    // And the dismissal is persisted.
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    expect(stored).toContain('a');
  });

  it('previously-dismissed claims (in localStorage) do not render', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(['a']));
    renderBanner([
      { paymentId: 'a', amountDisplay: '120 Kč', reason: null },
      { paymentId: 'b', amountDisplay: '240 Kč', reason: null },
    ]);
    // Only b should remain visible (one settle link + one dismiss button).
    expect(screen.getAllByRole('link').length).toBe(1);
    expect(screen.getAllByRole('button').length).toBe(1);
  });

  it('mixed dismissed/visible: dismissing one keeps the others visible', () => {
    renderBanner([
      { paymentId: 'a', amountDisplay: '120 Kč', reason: null },
      { paymentId: 'b', amountDisplay: '240 Kč', reason: null },
      { paymentId: 'c', amountDisplay: '360 Kč', reason: null },
    ]);
    expect(screen.getAllByRole('link').length).toBe(3);

    // Dismiss the first.
    const dismissButtons = screen.getAllByRole('button');
    fireEvent.click(dismissButtons[0]!);

    // Two remain.
    expect(screen.getAllByRole('link').length).toBe(2);
    expect(screen.getAllByRole('button').length).toBe(2);
  });
});

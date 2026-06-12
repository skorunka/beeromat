import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect, vi } from 'vitest';

import { MatchBetModule } from '@/components/home/match-bet-module';
import { ConfirmProvider } from '@/components/ui/confirm-dialog';
import type { BeerDebtRow, MemberBeerDebts } from '@/lib/db/queries/match-bet-debts';
import enMessages from '@/messages/en.json';

// Spec 030 — home IOU module: "X owes you a beer" / "You owe X a beer".

vi.mock('@/app/[locale]/(app)/match/actions', () => ({
  deliverBeerDebtAction: vi.fn(),
  undeliverBeerDebtAction: vi.fn(),
  voidBeerDebtAction: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/lib/celebrate', () => ({ celebrateBeer: vi.fn() }));

function debt(over: Partial<BeerDebtRow> = {}): BeerDebtRow {
  return {
    debtId: 'd-1',
    agreementId: 'a-1',
    counterpartyMemberId: 'm-2',
    counterpartyName: 'Pepa',
    counterpartyAvatarKey: null,
    counterpartyAvatarUploadAt: null,
    plannedBeerTypeId: 'b-1',
    plannedBeerName: 'Pilsner',
    beerCount: 1,
    createdAt: new Date('2026-06-01T18:00:00Z'),
    ...over,
  };
}

// Default "now" is 1 day after the debt's createdAt → fresh (no nudge);
// pass a later `now` to exercise the stale-IOU nudge.
function renderModule(debts: MemberBeerDebts, now = new Date('2026-06-02T18:00:00Z')) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {/* BeerIouRow's write-off control uses useConfirm(), which needs a
          ConfirmProvider above it (mounted in the (app) layout for real). */}
      <ConfirmProvider>
        <MatchBetModule debts={debts} beers={[]} currencyCode="CZK" locale="en" now={now} />
      </ConfirmProvider>
    </NextIntlClientProvider>,
  );
}

describe('MatchBetModule (component layer — spec 030)', () => {
  it('renders nothing when there are no open IOUs', () => {
    const { container } = renderModule({ owedToMe: [], iOwe: [] });
    expect(container.firstChild).toBeNull();
  });

  it('winner side: "{name} owes you a beer"', () => {
    renderModule({ owedToMe: [debt({ counterpartyName: 'Pepa' })], iOwe: [] });
    expect(screen.getByText(/pepa owes you a beer/i)).toBeInTheDocument();
  });

  it('loser side: "You owe {name} a beer"', () => {
    renderModule({ owedToMe: [], iOwe: [debt({ counterpartyName: 'Standa' })] });
    expect(screen.getByText(/you owe standa a beer/i)).toBeInTheDocument();
  });

  it('renders a Delivered control for each IOU', () => {
    renderModule({ owedToMe: [debt()], iOwe: [debt({ debtId: 'd-2', counterpartyName: 'X' })] });
    expect(screen.getAllByRole('button', { name: /delivered/i })).toHaveLength(2);
  });

  it('shows the "Beer IOUs · N" header counting all open IOUs both directions', () => {
    renderModule({ owedToMe: [debt()], iOwe: [debt({ debtId: 'd-2', counterpartyName: 'X' })] });
    expect(screen.getByRole('heading', { name: /beer ious/i })).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('a fresh IOU shows no stale nudge; an old one does', () => {
    // createdAt 2026-06-01, default now 2026-06-02 → fresh.
    const { unmount } = renderModule({ owedToMe: [], iOwe: [debt()] });
    expect(screen.queryByText(/hand it over/i)).not.toBeInTheDocument();
    unmount();
    // 9 days later → stale → loser sees the "hand it over?" poke.
    renderModule({ owedToMe: [], iOwe: [debt()] }, new Date('2026-06-10T18:00:00Z'));
    expect(screen.getByText(/hand it over/i)).toBeInTheDocument();
  });
});

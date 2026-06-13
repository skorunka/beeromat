import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect, vi } from 'vitest';

// next-intl's Link pulls in the navigation chain that doesn't resolve under
// jsdom — stub it to a plain anchor (same pattern as the other component tests).
vi.mock('@/lib/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: unknown; children: React.ReactNode }) => (
    <a href={String(href)} {...rest}>
      {children}
    </a>
  ),
}));

import { LeaderboardBoard } from '@/components/stats/leaderboard-board';
import { ScopeToggle } from '@/components/stats/scope-toggle';
import type { Leaderboard, BoardRow } from '@/lib/stats/types';
import enMessages from '@/messages/en.json';

const row = (id: string, name: string, value: number, rank: number): BoardRow => ({
  memberId: id,
  displayName: name,
  avatarKey: null,
  avatarUploadAt: null,
  value,
  rank,
});

function renderBoard(board: Leaderboard, viewerMemberId = 'm2') {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <LeaderboardBoard
        board={board}
        viewerMemberId={viewerMemberId}
        currencyCode="CZK"
        locale="en"
      />
    </NextIntlClientProvider>,
  );
}

describe('LeaderboardBoard (component — spec 034)', () => {
  it('renders the title, podium medal for #1, and highlights the viewer', () => {
    renderBoard({
      key: 'beers',
      scope: 'allTime',
      rows: [row('m1', 'Adam', 10, 1), row('m2', 'Bohuš', 8, 2), row('m3', 'Cyril', 5, 3)],
      viewerRow: row('m2', 'Bohuš', 8, 2),
      thresholdNote: null,
    });
    expect(screen.getByRole('heading', { name: /Most beers/i })).toBeInTheDocument();
    expect(screen.getByText('🥇')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    // Viewer (m2) row is annotated "· you".
    expect(screen.getByText(/Bohuš · you/)).toBeInTheDocument();
  });

  it('formats the win-rate value as a percentage + shows the threshold note', () => {
    renderBoard({
      key: 'winRate',
      scope: 'allTime',
      rows: [row('m1', 'Adam', 75, 1)],
      viewerRow: null,
      thresholdNote: null,
    });
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText(/min 10 matches/i)).toBeInTheDocument();
  });

  it('renders a friendly empty state when there are no rows', () => {
    renderBoard({ key: 'streak', scope: 'season', rows: [], viewerRow: null, thresholdNote: null });
    expect(screen.getByText(/Nothing yet/i)).toBeInTheDocument();
  });

  it('appends the viewer row (with a separator) when they are outside the shown rows', () => {
    renderBoard(
      {
        key: 'beers',
        scope: 'allTime',
        rows: [row('m1', 'Adam', 10, 1)],
        viewerRow: row('m9', 'Zed', 1, 40),
        thresholdNote: null,
      },
      'm9',
    );
    expect(screen.getByText(/Zed · you/)).toBeInTheDocument();
  });
});

describe('ScopeToggle (component — spec 034)', () => {
  it('marks the active scope and links to the other', () => {
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <ScopeToggle scope="allTime" board="beers" />
      </NextIntlClientProvider>,
    );
    const allTime = screen.getByRole('link', { name: /All-time/i });
    const season = screen.getByRole('link', { name: /This season/i });
    expect(allTime).toHaveAttribute('aria-current', 'true');
    expect(season).toHaveAttribute('href', expect.stringContaining('scope=season'));
    // Scope links preserve the current board so flipping scope keeps the board.
    expect(season).toHaveAttribute('href', expect.stringContaining('board=beers'));
  });
});

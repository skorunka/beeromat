import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect } from 'vitest';

import { AchievementsSection } from '@/components/achievements/achievements-section';
import type { MemberStats } from '@/lib/stats/types';
import type { BadgeKey } from '@/lib/achievements/types';
import enMessages from '@/messages/en.json';
import csMessages from '@/messages/cs.json';

const baseStats: MemberStats = {
  memberId: 'm1',
  displayName: 'Adam',
  avatarKey: null,
  avatarUploadAt: null,
  matchesPlayed: 0,
  won: 0,
  lost: 0,
  winRatio: null,
  currentStreak: 0,
  bestStreak: 0,
  nemesis: null,
  favouriteVictim: null,
  bestPartner: null,
  jinxPartner: null,
  totalBeers: 0,
  beersPerNight: null,
  favouriteBeer: null,
  roundsPoured: 0,
  distinctBeerTypes: 0,
  sessionsAttended: 0,
  tabMinor: 0n,
  lastWinAt: null,
  owesMostTo: null,
};
const stats = (o: Partial<MemberStats>): MemberStats => ({ ...baseStats, ...o });

function renderSection(
  props: {
    stats: MemberStats;
    earned: { key: BadgeKey; earnedAt: Date }[];
  },
  locale: 'en' | 'cs' = 'en',
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === 'en' ? enMessages : csMessages}>
      <AchievementsSection stats={props.stats} earned={props.earned} />
    </NextIntlClientProvider>,
  );
}

describe('AchievementsSection (component — spec 035)', () => {
  it('shows ALL nine badges with the earned-of-total count', () => {
    renderSection({ stats: stats({ totalBeers: 64, matchesPlayed: 12 }), earned: [] });
    // header count: 0 of 9
    expect(screen.getByText('0 of 9')).toBeInTheDocument();
    // a sampling of catalog names is present (all nine render)
    expect(screen.getByText('Century Club')).toBeInTheDocument();
    expect(screen.getByText('Winner')).toBeInTheDocument();
    expect(screen.getByText('Night Owl')).toBeInTheDocument();
  });

  it('earned badge is dated and sorted first; locked badges show condition + progress', () => {
    renderSection({
      stats: stats({ totalBeers: 120, matchesPlayed: 12, won: 5 }),
      earned: [{ key: 'centuryClub', earnedAt: new Date('2024-03-01T12:00:00Z') }],
    });

    expect(screen.getByText('1 of 9')).toBeInTheDocument();
    // earned badge shows an "Earned …" date caption
    expect(screen.getByText(/Earned/)).toBeInTheDocument();
    // a locked badge shows its condition + a progress reading (Regular: 12 / 25)
    expect(screen.getByText('Play 25 matches')).toBeInTheDocument();
    expect(screen.getByText('12 / 25')).toBeInTheDocument();

    // Earned (Century Club) sorts ahead of every locked badge.
    const names = screen
      .getAllByText(
        /Century Club|Winner|Sharpshooter|On Fire|Hat-trick|Round King|Regular|Connoisseur|Night Owl/,
      )
      .map((el) => el.textContent);
    expect(names[0]).toBe('Century Club');
  });

  it('new member: empty note + all locked at 0 / target', () => {
    renderSection({ stats: baseStats, earned: [] });
    expect(screen.getByText('0 of 9')).toBeInTheDocument();
    expect(screen.getByText(/whole wall to unlock/i)).toBeInTheDocument();
    // every locked count badge starts at 0 / target — Century Club at 0 / 100
    expect(screen.getByText('0 / 100')).toBeInTheDocument();
  });

  it('renders Czech copy', () => {
    renderSection({ stats: baseStats, earned: [] }, 'cs');
    expect(screen.getByText('Odznaky')).toBeInTheDocument();
    expect(screen.getByText('Stovkař')).toBeInTheDocument();
    expect(screen.getByText('Naloguj 100 piv')).toBeInTheDocument();
  });

  it('shows club rarity per badge when provided (US3)', () => {
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <AchievementsSection
          stats={stats({ totalBeers: 120 })}
          earned={[{ key: 'centuryClub', earnedAt: new Date('2024-03-01T12:00:00Z') }]}
          rarity={{ holdersByKey: { centuryClub: 3 } as Record<BadgeKey, number>, clubMembers: 28 }}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText('3 of 28 members')).toBeInTheDocument();
    // a badge nobody holds shows the "be the first" state
    expect(screen.getAllByText(/be the first/i).length).toBeGreaterThan(0);
  });

  it('does not render a progress bar on an earned badge', () => {
    renderSection({
      stats: stats({ totalBeers: 120 }),
      earned: [{ key: 'centuryClub', earnedAt: new Date('2024-03-01T12:00:00Z') }],
    });
    // The earned Century Club tile shows its date, not a "x / 100" progress.
    const centuryName = screen.getByText('Century Club');
    const tile = centuryName.closest('div')!.parentElement!;
    expect(within(tile).queryByText(/\/ 100/)).not.toBeInTheDocument();
  });
});

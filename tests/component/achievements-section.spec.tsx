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
    // earned badge shows an "Earned {date}" caption (the trailing space/date
    // disambiguates from the spec-037 "Earned" filter button).
    expect(screen.getByText(/Earned \w/)).toBeInTheDocument();
    // a SINGLE badge shows its condition (Sharpshooter, locked); a tiered family
    // (Regular) shows a progress bar toward its bronze tier (12 / 25).
    expect(screen.getByText('Win 60% over 10+ matches')).toBeInTheDocument();
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
    expect(screen.getByText('Stovkař')).toBeInTheDocument(); // Century Club family (cs)
    expect(screen.getByText(/celá stěna k odemčení/)).toBeInTheDocument(); // cs empty note
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

  it('does not render a progress bar on a maxed (gold) family', () => {
    const at = new Date('2024-03-01T12:00:00Z');
    renderSection({
      stats: stats({ totalBeers: 600 }),
      earned: [
        { key: 'centuryClub', earnedAt: at },
        { key: 'centuryClubSilver', earnedAt: at },
        { key: 'centuryClubGold', earnedAt: at },
      ],
    });
    // Gold (maxed) Century Club shows its date + Gold cue, no "x / y" progress bar.
    const centuryName = screen.getByText('Century Club');
    const tile = centuryName.closest('div')!.parentElement!;
    expect(within(tile).queryByText(/\d+ \/ \d+/)).not.toBeInTheDocument();
  });
});

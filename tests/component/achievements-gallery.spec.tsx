import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, it, expect } from 'vitest';

import { AchievementsGallery } from '@/components/achievements/achievements-gallery';
import type { BadgeView } from '@/lib/achievements/types';
import enMessages from '@/messages/en.json';

// Spec 037 — gallery filter + sort controls over server-built BadgeView[].

function v(over: Partial<BadgeView> & Pick<BadgeView, 'key' | 'emoji'>): BadgeView {
  return {
    nameKey: `achievement.badge.${over.key}.name`,
    earned: false,
    earnedAt: null,
    progress: { current: 0, target: 25 },
    ...over,
  } as BadgeView;
}

// Default order (as the section passes): earned first, then locked.
const VIEWS: BadgeView[] = [
  v({ key: 'centuryClub', emoji: '💯', earned: true, earnedAt: new Date('2024-03-01T12:00:00Z'), holders: 20, clubMembers: 28 }),
  v({ key: 'winner', emoji: '🏆', earned: true, earnedAt: new Date('2024-02-01T12:00:00Z'), holders: 4, clubMembers: 28 }),
  v({ key: 'regular', emoji: '🎾', progress: { current: 20, target: 25 }, holders: 10, clubMembers: 28 }), // 0.8
  v({ key: 'nightOwl', emoji: '🦉', progress: { current: 2, target: 25 }, holders: 2, clubMembers: 28 }), // 0.08
];

function renderGallery(views = VIEWS) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <AchievementsGallery views={views} />
    </NextIntlClientProvider>,
  );
}

const NAMES = /Century Club|Winner|Regular|Night Owl/;
const order = () => screen.getAllByText(NAMES).map((el) => el.textContent);

describe('AchievementsGallery (component — spec 037)', () => {
  // The gallery now persists filter/sort to localStorage; clear it so each
  // test starts from the defaults rather than a prior test's choice.
  beforeEach(() => localStorage.clear());

  it('shows all badges in the given order by default', () => {
    renderGallery();
    expect(order()).toEqual(['Century Club', 'Winner', 'Regular', 'Night Owl']);
  });

  it('filter Earned shows only earned badges; Locked only locked', () => {
    renderGallery();
    fireEvent.click(screen.getByRole('button', { name: /^earned$/i }));
    expect(order()).toEqual(['Century Club', 'Winner']);
    fireEvent.click(screen.getByRole('button', { name: /^locked$/i }));
    expect(order()).toEqual(['Regular', 'Night Owl']);
  });

  it('Closest sort puts locked nearest-to-unlock first, earned after', () => {
    renderGallery();
    fireEvent.click(screen.getByRole('button', { name: /closest/i }));
    expect(order()).toEqual(['Regular', 'Night Owl', 'Century Club', 'Winner']);
  });

  it('Rarest sort orders by fewest holders first', () => {
    renderGallery();
    fireEvent.click(screen.getByRole('button', { name: /rarest/i }));
    expect(order()).toEqual(['Night Owl', 'Winner', 'Regular', 'Century Club']);
  });

  it('a filter that yields nothing shows the friendly empty note', () => {
    // all-locked views → "Earned" filter is empty
    renderGallery([v({ key: 'regular', emoji: '🎾' }), v({ key: 'nightOwl', emoji: '🦉' })]);
    fireEvent.click(screen.getByRole('button', { name: /^earned$/i }));
    expect(screen.getByText(/nothing here/i)).toBeInTheDocument();
  });

  it('hides the Rarest sort when no view carries holders', () => {
    renderGallery([v({ key: 'regular', emoji: '🎾' })]);
    expect(screen.queryByRole('button', { name: /rarest/i })).toBeNull();
  });

  it('persists the filter choice across remounts (localStorage)', async () => {
    const first = renderGallery();
    fireEvent.click(screen.getByRole('button', { name: /^locked$/i }));
    await waitFor(() => expect(localStorage.getItem('beeromat.gallery.filter')).toBe('locked'));
    first.unmount();

    // A fresh mount reads the saved choice → starts filtered to Locked.
    renderGallery();
    await waitFor(() => expect(order()).toEqual(['Regular', 'Night Owl']));
  });

  it('drops a saved Rarest sort when the profile has no rarity data', async () => {
    localStorage.setItem('beeromat.gallery.sort', 'rarest');
    // views without holders → rarity unavailable; restored 'rarest' is ignored.
    renderGallery([v({ key: 'regular', emoji: '🎾' }), v({ key: 'nightOwl', emoji: '🦉' })]);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /rarest/i })).toBeNull(),
    );
    // No crash; default order preserved.
    expect(order()).toEqual(['Regular', 'Night Owl']);
  });
});

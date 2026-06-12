import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: unknown; children: React.ReactNode }) => (
    <a href={String(href)} {...rest}>
      {children}
    </a>
  ),
}));

import { StatTile } from '@/components/stats/stat-tile';
import { StatPersonCard } from '@/components/stats/head-to-head-card';

// Spec 034 — the profile's presentational pieces. The page itself is an async
// server component (verified live + integration-tested via getPlayerStats).

describe('StatTile (component — spec 034)', () => {
  it('renders the label + value', () => {
    render(<StatTile label="Won" value="23" accent />);
    expect(screen.getByText('Won')).toBeInTheDocument();
    expect(screen.getByText('23')).toBeInTheDocument();
  });
});

describe('StatPersonCard (component — spec 034)', () => {
  it('renders the caption, name + record, and links to the member profile', () => {
    render(
      <StatPersonCard
        caption="Nemesis 😈"
        memberId="m-7"
        face={{ displayName: 'Honza', avatarKey: null, avatarUploadAt: null }}
        record="0–7"
      />,
    );
    expect(screen.getByText('Nemesis 😈')).toBeInTheDocument();
    expect(screen.getByText('Honza')).toBeInTheDocument();
    expect(screen.getByText('0–7')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', expect.stringContaining('/members/m-7'));
  });
});

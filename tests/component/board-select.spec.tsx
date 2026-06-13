import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect, vi } from 'vitest';

const push = vi.fn();
vi.mock('@/lib/i18n/navigation', () => ({
  useRouter: () => ({ push }),
}));

import { BoardSelect } from '@/components/stats/board-select';
import enMessages from '@/messages/en.json';

// Spec 034 follow-up — the single-board switcher. One board shown at a time;
// the dropdown navigates to ?board= (preserving scope).

function renderSelect(current: Parameters<typeof BoardSelect>[0]['current'], scope: 'allTime' | 'season' = 'allTime') {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <BoardSelect current={current} scope={scope} />
    </NextIntlClientProvider>,
  );
}

describe('BoardSelect (component — spec 034 follow-up)', () => {
  it('shows the current board on the trigger', () => {
    renderSelect('beers');
    expect(screen.getByRole('button', { name: /Most beers/i })).toBeInTheDocument();
  });

  it('opens to list all seven boards', async () => {
    renderSelect('beers');
    fireEvent.click(screen.getByRole('button', { name: /Most beers/i }));
    await waitFor(() => {
      expect(screen.queryAllByRole('menuitemradio').length).toBe(7);
    });
  });

  it('navigates to ?board= on pick, preserving season scope', async () => {
    renderSelect('beers', 'season');
    fireEvent.click(screen.getByRole('button', { name: /Most beers/i }));
    const wins = await screen.findByRole('menuitemradio', { name: /Most wins/i });
    fireEvent.click(wins);
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith(expect.stringContaining('board=wins'));
    });
    expect(push).toHaveBeenCalledWith(expect.stringContaining('scope=season'));
  });
});

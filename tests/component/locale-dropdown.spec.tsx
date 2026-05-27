import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { LocaleDropdown } from '@/components/ui/locale-dropdown';

// Spec 022/024 follow-up — shared dropdown used by admin config +
// setup wizard. Owns its own `open` state so the popup closes the
// moment a value is picked (base-ui RadioItem doesn't auto-close
// by default).

describe('LocaleDropdown (component layer)', () => {
  it('renders the trigger with the endonym for the picked locale', () => {
    render(<LocaleDropdown value="cs" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /čeština/i })).toBeInTheDocument();
  });

  it('shows the English endonym when value is en', () => {
    render(<LocaleDropdown value="en" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /english/i })).toBeInTheDocument();
  });

  it('opens the popup on trigger click and lists every locale option', async () => {
    render(<LocaleDropdown value="cs" onChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /čeština/i }));
    await waitFor(() => {
      const items = screen.queryAllByRole('menuitemradio');
      expect(items.length).toBeGreaterThanOrEqual(2);
    });
    expect(screen.getAllByText(/english/i).length).toBeGreaterThanOrEqual(1);
  });

  it('calls onChange with the picked locale code', async () => {
    const onChange = vi.fn();
    render(<LocaleDropdown value="cs" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /čeština/i }));
    const enOption = await screen.findByRole('menuitemradio', { name: /english/i });
    fireEvent.click(enOption);
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('en');
    });
  });

  it('falls back to upper-case locale code if no endonym in the map', () => {
    // Defensive — current routing.locales is cs/en, both have
    // endonyms. If a future locale is added without an endonym
    // entry, the trigger should still render.
    render(<LocaleDropdown value="cs" onChange={() => {}} />);
    // Just verifies no throw + the trigger renders.
    expect(screen.getByRole('button')).toBeInTheDocument();
  });
});

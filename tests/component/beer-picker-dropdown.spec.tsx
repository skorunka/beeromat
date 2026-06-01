import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { BeerPickerDropdown, type BeerPickerOption } from '@/components/picker/beer-picker-dropdown';

const beers: BeerPickerOption[] = [
  { id: 'b-pils', name: 'Pilsner Urquell', unitPriceMinor: 4000n, currentStock: 10 },
  { id: 'b-bernard', name: 'Bernard 10°', unitPriceMinor: 3000n, currentStock: 5 },
  { id: 'b-out', name: 'Kozel', unitPriceMinor: 3500n, currentStock: 0 },
];

function renderDropdown(opts: { value?: string | null; onChange?: (id: string | null) => void } = {}) {
  return render(
    <BeerPickerDropdown
      beers={beers}
      value={opts.value ?? null}
      onChange={opts.onChange ?? (() => {})}
      currencyCode="CZK"
      locale="en"
      placeholder="Pick a beer"
      ariaLabel="Beer"
    />,
  );
}

describe('BeerPickerDropdown', () => {
  it('renders the placeholder when value is null', () => {
    renderDropdown({ value: null });
    expect(screen.getByRole('button', { name: /beer/i })).toHaveTextContent(/pick a beer/i);
  });

  it('renders the selected beer name when value is set', () => {
    renderDropdown({ value: 'b-pils' });
    expect(screen.getByRole('button', { name: /beer/i })).toHaveTextContent('Pilsner Urquell');
  });

  it('opens to one option per beer, each with its price', async () => {
    renderDropdown();
    fireEvent.click(screen.getByRole('button', { name: /beer/i }));
    await waitFor(() => {
      expect(screen.queryAllByRole('menuitemradio').length).toBe(3);
    });
    expect(screen.getByText('Pilsner Urquell')).toBeInTheDocument();
    // Whole amounts → adaptive precision drops decimals: en + CZK → "CZK 40".
    expect(screen.getByText(/CZK[\s ]?40$/)).toBeInTheDocument();
    expect(screen.getByText(/CZK[\s ]?30$/)).toBeInTheDocument();
  });

  it('disables an out-of-stock option', async () => {
    renderDropdown();
    fireEvent.click(screen.getByRole('button', { name: /beer/i }));
    await waitFor(() => {
      const kozel = screen.getByRole('menuitemradio', { name: /Kozel/ });
      expect(kozel).toHaveAttribute('aria-disabled', 'true');
    });
  });

  it('fires onChange with the beer id when an option is picked', async () => {
    const onChange = vi.fn();
    renderDropdown({ onChange });
    fireEvent.click(screen.getByRole('button', { name: /beer/i }));
    await waitFor(() => screen.getByRole('menuitemradio', { name: /Bernard/ }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Bernard/ }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('b-bernard'));
  });
});

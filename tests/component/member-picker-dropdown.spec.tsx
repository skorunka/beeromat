import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { MemberPickerDropdown } from '@/components/picker/member-picker-dropdown';
import type { MemberOption } from '@/components/picker/types';

// Spec 024 T010 — component test for the dropdown-shape picker.

const photoMember: MemberOption = {
  id: 'm-photo',
  displayName: 'Pavel',
  avatarKey: null,
  avatarUploadAt: new Date('2026-05-01T12:00:00Z'),
};
const glyphMember: MemberOption = {
  id: 'm-glyph',
  displayName: 'Tereza',
  avatarKey: 'star',
  avatarUploadAt: null,
};
const plainMember: MemberOption = {
  id: 'm-plain',
  displayName: 'Standa',
  avatarKey: null,
  avatarUploadAt: null,
};

function renderDropdown(opts: {
  members?: MemberOption[];
  value?: string | null;
  onChange?: (id: string | null) => void;
  disabledIds?: Set<string>;
  placeholder?: string;
} = {}) {
  return render(
    <MemberPickerDropdown
      members={opts.members ?? [photoMember, glyphMember, plainMember]}
      value={opts.value ?? null}
      onChange={opts.onChange ?? (() => {})}
      disabledIds={opts.disabledIds}
      placeholder={opts.placeholder ?? 'Pick a seat'}
      ariaLabel="Seat A1"
    />,
  );
}

beforeEach(() => {});

describe('MemberPickerDropdown — trigger states (spec 024)', () => {
  it('renders the placeholder when value is null', () => {
    renderDropdown({ value: null, placeholder: 'Choose a player' });
    const trigger = screen.getByRole('button', { name: /seat a1/i });
    expect(trigger).toHaveTextContent(/choose a player/i);
    // No avatar wrapper inside an unpicked trigger.
    expect(trigger.querySelector('span.bg-primary\\/15')).not.toBeInTheDocument();
  });

  it('renders avatar + name when a value is picked', () => {
    renderDropdown({ value: 'm-glyph' });
    const trigger = screen.getByRole('button', { name: /seat a1/i });
    expect(trigger).toHaveTextContent('Tereza');
    // Avatar wrapper present on a picked trigger.
    expect(trigger.querySelector('span.bg-primary\\/15')).toBeInTheDocument();
  });

  it('falls back gracefully when value points at a missing member', () => {
    renderDropdown({ value: 'ghost-id' });
    // No avatar, falls back to placeholder.
    const trigger = screen.getByRole('button', { name: /seat a1/i });
    expect(trigger.querySelector('span.bg-primary\\/15')).not.toBeInTheDocument();
    expect(trigger).toHaveTextContent(/pick a seat/i);
  });
});

describe('MemberPickerDropdown — popup interactions (spec 024)', () => {
  it('opens the popup on trigger click and shows one item per member + a clear item', async () => {
    renderDropdown();
    fireEvent.click(screen.getByRole('button', { name: /seat a1/i }));

    await waitFor(() => {
      // Base-ui Menu uses role="menuitemradio" for RadioItem.
      const items = screen.queryAllByRole('menuitemradio');
      // 3 members + 1 clear option = 4.
      expect(items.length).toBeGreaterThanOrEqual(4);
    });

    // Member names render.
    expect(screen.getByText('Pavel')).toBeInTheDocument();
    expect(screen.getByText('Tereza')).toBeInTheDocument();
    expect(screen.getByText('Standa')).toBeInTheDocument();
    // Clear option visible (the "—" sentinel).
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('fires onChange(id) when a member option is selected', async () => {
    const onChange = vi.fn();
    renderDropdown({ onChange });
    fireEvent.click(screen.getByRole('button', { name: /seat a1/i }));

    const pavelOption = await screen.findByRole('menuitemradio', { name: /pavel/i });
    fireEvent.click(pavelOption);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('m-photo');
    });
  });

  it('fires onChange(null) when the clear "—" option is selected', async () => {
    const onChange = vi.fn();
    renderDropdown({ value: 'm-glyph', onChange });
    fireEvent.click(screen.getByRole('button', { name: /seat a1/i }));

    const clearOption = await screen.findByRole('menuitemradio', { name: '—' });
    fireEvent.click(clearOption);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(null);
    });
  });

  it('renders disabledIds members as disabled', async () => {
    renderDropdown({ disabledIds: new Set(['m-photo']) });
    fireEvent.click(screen.getByRole('button', { name: /seat a1/i }));

    const pavelOption = await screen.findByRole('menuitemradio', { name: /pavel/i });
    // base-ui Menu sets aria-disabled on disabled items.
    expect(pavelOption).toHaveAttribute('aria-disabled', 'true');
    // Other members remain enabled.
    const terezaOption = screen.getByRole('menuitemradio', { name: /tereza/i });
    expect(terezaOption).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('current value is NOT disabled even if listed in disabledIds', async () => {
    // Re-picking the same option must work.
    renderDropdown({
      value: 'm-photo',
      disabledIds: new Set(['m-photo']),
    });
    fireEvent.click(screen.getByRole('button', { name: /seat a1/i }));

    const pavelOption = await screen.findByRole('menuitemradio', { name: /pavel/i });
    expect(pavelOption).not.toHaveAttribute('aria-disabled', 'true');
  });
});

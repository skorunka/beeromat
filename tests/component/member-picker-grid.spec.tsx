import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { MemberPickerGrid } from '@/components/picker/member-picker-grid';
import type { MemberOption } from '@/components/picker/types';

// Spec 024 T005 — component test for the tile-shape member picker.

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

function renderGrid(opts: {
  members?: MemberOption[];
  value?: string | null;
  onChange?: (id: string | null) => void;
} = {}) {
  return render(
    <MemberPickerGrid
      members={opts.members ?? [photoMember, glyphMember, plainMember]}
      value={opts.value ?? null}
      onChange={opts.onChange ?? (() => {})}
      ariaLabel="Pick a member"
    />,
  );
}

beforeEach(() => {});

describe('MemberPickerGrid (component layer — spec 024)', () => {
  it('renders one button per option with the displayName', () => {
    renderGrid();
    expect(screen.getByRole('radio', { name: /pavel/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /tereza/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /standa/i })).toBeInTheDocument();
  });

  it('renders the correct avatar variant per option', () => {
    const { container } = renderGrid();
    // Photo member → an <img>.
    expect(container.querySelector('img')).toBeInTheDocument();
    // Glyph member → a glyph svg (at least one).
    expect(container.querySelector('svg')).toBeInTheDocument();
    // Plain member → initials chip 'ST' (Standa).
    expect(screen.getByText('ST')).toBeInTheDocument();
  });

  it('marks the matching tile with aria-checked when value is set', () => {
    renderGrid({ value: 'm-glyph' });
    expect(screen.getByRole('radio', { name: /tereza/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('radio', { name: /pavel/i })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('fires onChange with the picked id when an unselected tile is tapped', () => {
    const onChange = vi.fn();
    renderGrid({ onChange });
    fireEvent.click(screen.getByRole('radio', { name: /pavel/i }));
    expect(onChange).toHaveBeenCalledWith('m-photo');
  });

  it('tap on already-selected tile clears (onChange(null))', () => {
    const onChange = vi.fn();
    renderGrid({ value: 'm-glyph', onChange });
    fireEvent.click(screen.getByRole('radio', { name: /tereza/i }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('empty members array renders nothing', () => {
    const { container } = renderGrid({ members: [] });
    expect(container.firstChild).toBeNull();
  });

  it('the radio buttons are keyboard-reachable (each is a <button type="button">)', () => {
    renderGrid();
    const buttons = screen.getAllByRole('radio');
    for (const b of buttons) {
      expect(b.tagName.toLowerCase()).toBe('button');
      expect(b).toHaveAttribute('type', 'button');
    }
  });
});

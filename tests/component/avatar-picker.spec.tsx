import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { AvatarPicker } from '@/components/account/avatar-picker';
import { AVATAR_KEYS } from '@/lib/avatars/palette';
import enMessages from '@/messages/en.json';

// Spec 020 T014 — component test for the AvatarPicker grid.

const mockSetAvatarAction = vi.fn();
vi.mock('@/app/[locale]/(app)/account/actions', () => ({
  setAvatarAction: (...args: unknown[]) => mockSetAvatarAction(...args),
}));

// sonner toast — capture the calls so we can assert on error path.
const mockToastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args) },
}));

function renderPicker(currentKey: string | null = null) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <AvatarPicker currentKey={currentKey} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  mockSetAvatarAction.mockReset();
  mockToastError.mockReset();
});

describe('AvatarPicker (component layer — spec 020)', () => {
  it('renders one tile per palette key plus the Default tile', () => {
    renderPicker(null);
    // Default tile + every key in AVATAR_KEYS.
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(AVATAR_KEYS.length + 1);
    expect(screen.getByRole('button', { name: /default/i })).toBeInTheDocument();
    for (const key of AVATAR_KEYS) {
      expect(screen.getByRole('button', { name: key })).toBeInTheDocument();
    }
  });

  it('marks the matching tile when currentKey is set', () => {
    renderPicker('star');
    const starTile = screen.getByRole('button', { name: 'star' });
    expect(starTile).toHaveAttribute('aria-pressed', 'true');
    const defaultTile = screen.getByRole('button', { name: /default/i });
    expect(defaultTile).toHaveAttribute('aria-pressed', 'false');
  });

  it('marks the Default tile when currentKey is null', () => {
    renderPicker(null);
    expect(screen.getByRole('button', { name: /default/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('calls setAvatarAction with the picked key on click', async () => {
    mockSetAvatarAction.mockResolvedValue({ ok: true });
    renderPicker(null);

    fireEvent.click(screen.getByRole('button', { name: 'trophy' }));

    await waitFor(() => {
      expect(mockSetAvatarAction).toHaveBeenCalledWith({ avatarKey: 'trophy' });
    });
    // Optimistic update should mark trophy as pressed immediately.
    expect(screen.getByRole('button', { name: 'trophy' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('calls setAvatarAction with null when tapping the Default tile', async () => {
    mockSetAvatarAction.mockResolvedValue({ ok: true });
    renderPicker('beer-mug');

    fireEvent.click(screen.getByRole('button', { name: /default/i }));

    await waitFor(() => {
      expect(mockSetAvatarAction).toHaveBeenCalledWith({ avatarKey: null });
    });
  });

  it('rolls back the optimistic update + shows an error toast on failure', async () => {
    mockSetAvatarAction.mockResolvedValue({ ok: false, code: 'INVALID_KEY' });
    renderPicker(null);

    fireEvent.click(screen.getByRole('button', { name: 'lightning' }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalled();
    });
    // Should have reverted to null (Default tile pressed).
    expect(screen.getByRole('button', { name: /default/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'lightning' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('no-ops when tapping the already-selected tile', () => {
    renderPicker('heart');
    fireEvent.click(screen.getByRole('button', { name: 'heart' }));
    expect(mockSetAvatarAction).not.toHaveBeenCalled();
  });
});

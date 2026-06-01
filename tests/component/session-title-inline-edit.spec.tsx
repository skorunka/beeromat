import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { SessionTitleInlineEdit } from '@/components/session/session-title-inline-edit';
import enMessages from '@/messages/en.json';

// Spec 022 T008 — component test for the inline editable session title.

const mockSetSessionTitleAction = vi.fn();
vi.mock('@/app/[locale]/(app)/tab/actions', () => ({
  setSessionTitleAction: (...args: unknown[]) => mockSetSessionTitleAction(...args),
}));

const mockToastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args) },
}));

function renderEdit(currentTitle: string | null) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <SessionTitleInlineEdit
        sessionId="session-1"
        currentTitle={currentTitle}
        fallbackLabel="Round"
      />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  mockSetSessionTitleAction.mockReset();
  mockToastError.mockReset();
});

describe('SessionTitleInlineEdit (component layer — spec 022)', () => {
  it('idle: renders the title when set', () => {
    renderEdit('Wed doubles');
    const btn = screen.getByRole('button', { name: /edit round name/i });
    expect(btn).toHaveTextContent('Wed doubles');
  });

  it('idle: renders the fallback label when title is null', () => {
    renderEdit(null);
    const btn = screen.getByRole('button', { name: /edit round name/i });
    expect(btn).toHaveTextContent('Round');
  });

  it('click → enters editing state with the input pre-filled', async () => {
    renderEdit('Wed doubles');
    fireEvent.click(screen.getByRole('button', { name: /edit round name/i }));
    const input = await screen.findByRole('textbox', { name: /edit round name/i });
    expect(input).toHaveValue('Wed doubles');
  });

  it('Enter saves the trimmed value via the action', async () => {
    mockSetSessionTitleAction.mockResolvedValue({ ok: true, title: 'Po finále' });
    renderEdit(null);
    fireEvent.click(screen.getByRole('button', { name: /edit round name/i }));
    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: '   Po finále   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(mockSetSessionTitleAction).toHaveBeenCalledWith({
        sessionId: 'session-1',
        title: 'Po finále',
      });
    });
  });

  it('blur also saves (live edit, no confirm)', async () => {
    mockSetSessionTitleAction.mockResolvedValue({ ok: true, title: 'Friday' });
    renderEdit(null);
    fireEvent.click(screen.getByRole('button', { name: /edit round name/i }));
    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: 'Friday' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(mockSetSessionTitleAction).toHaveBeenCalledWith({
        sessionId: 'session-1',
        title: 'Friday',
      });
    });
  });

  it('Esc cancels without saving + restores the prior value', async () => {
    renderEdit('Wed doubles');
    fireEvent.click(screen.getByRole('button', { name: /edit round name/i }));
    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: 'WRONG' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(mockSetSessionTitleAction).not.toHaveBeenCalled();
    const btn = await screen.findByRole('button', { name: /edit round name/i });
    expect(btn).toHaveTextContent('Wed doubles');
  });

  it('Cancel discards even when a blur fires first (touch race)', async () => {
    // On touch, tapping Cancel can fire the input's blur (→ commit)
    // before onClick. The Cancel button marks cancelled in pointerDown
    // (before blur) so the blur-saves-on-exit rule discards instead.
    renderEdit('Original');
    fireEvent.click(screen.getByRole('button', { name: /edit round name/i }));
    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: 'WRONG' } });

    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    fireEvent.pointerDown(cancelBtn); // lands before the blur
    fireEvent.blur(input); // must NOT save
    fireEvent.click(cancelBtn);

    expect(mockSetSessionTitleAction).not.toHaveBeenCalled();
    const btn = await screen.findByRole('button', { name: /edit round name/i });
    expect(btn).toHaveTextContent('Original');
  });

  it('Save button commits the edited value via the action', async () => {
    mockSetSessionTitleAction.mockResolvedValue({ ok: true, title: 'Saved' });
    renderEdit(null);
    fireEvent.click(screen.getByRole('button', { name: /edit round name/i }));
    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: 'Saved' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(mockSetSessionTitleAction).toHaveBeenCalledWith({
        sessionId: 'session-1',
        title: 'Saved',
      });
    });
  });

  it('input maxLength clamps at 60 (cap from schema)', async () => {
    renderEdit(null);
    fireEvent.click(screen.getByRole('button', { name: /edit round name/i }));
    const input = (await screen.findByRole('textbox')) as HTMLInputElement;
    expect(input.maxLength).toBe(60);
  });

  it('error response rolls back optimistic update + shows toast', async () => {
    mockSetSessionTitleAction.mockResolvedValue({
      ok: false,
      code: 'VALIDATION_FAILED',
    });
    renderEdit('Original');
    fireEvent.click(screen.getByRole('button', { name: /edit round name/i }));
    const input = await screen.findByRole('textbox');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Optimistic' } });
      fireEvent.keyDown(input, { key: 'Enter' });
    });

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalled();
    });
    const btn = await screen.findByRole('button', { name: /edit round name/i });
    expect(btn).toHaveTextContent('Original');
  });

  it('no-ops when the value is unchanged on commit', async () => {
    renderEdit('Same');
    fireEvent.click(screen.getByRole('button', { name: /edit round name/i }));
    const input = await screen.findByRole('textbox');
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(mockSetSessionTitleAction).not.toHaveBeenCalled();
  });
});

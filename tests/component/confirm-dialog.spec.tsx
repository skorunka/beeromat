import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect, vi } from 'vitest';

import { ConfirmProvider, useConfirm, type ConfirmOptions } from '@/components/ui/confirm-dialog';
import enMessages from '@/messages/en.json';

// Component test for the app-wide confirm dialog (window.confirm
// replacement). Renders the provider + a tiny harness that triggers
// confirm() and records the resolved boolean.

function Harness({
  options,
  onResult,
}: {
  options: ConfirmOptions;
  onResult: (r: boolean) => void;
}) {
  const confirm = useConfirm();
  return (
    <button type="button" onClick={async () => onResult(await confirm(options))}>
      trigger
    </button>
  );
}

function renderConfirm(options: ConfirmOptions, onResult: (r: boolean) => void) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ConfirmProvider>
        <Harness options={options} onResult={onResult} />
      </ConfirmProvider>
    </NextIntlClientProvider>,
  );
}

describe('ConfirmProvider / useConfirm', () => {
  it('shows the title + description and custom button labels when opened', async () => {
    renderConfirm(
      { title: 'Zrušit zápas?', description: 'Nelze vrátit.', confirmLabel: 'Zrušit', cancelLabel: 'Zpět' },
      () => {},
    );
    fireEvent.click(screen.getByRole('button', { name: 'trigger' }));

    expect(await screen.findByText('Zrušit zápas?')).toBeInTheDocument();
    expect(screen.getByText('Nelze vrátit.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zrušit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zpět' })).toBeInTheDocument();
  });

  it('resolves true when the confirm button is clicked', async () => {
    const onResult = vi.fn();
    renderConfirm({ title: 'Go?', confirmLabel: 'Yes' }, onResult);
    fireEvent.click(screen.getByRole('button', { name: 'trigger' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Yes' }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
  });

  it('resolves false when the cancel button is clicked', async () => {
    const onResult = vi.fn();
    renderConfirm({ title: 'Go?', cancelLabel: 'No' }, onResult);
    fireEvent.click(screen.getByRole('button', { name: 'trigger' }));

    fireEvent.click(await screen.findByRole('button', { name: 'No' }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });

  it('falls back to common.confirm / common.cancel labels', async () => {
    renderConfirm({ title: 'Plain' }, () => {});
    fireEvent.click(screen.getByRole('button', { name: 'trigger' }));

    expect(await screen.findByText('Plain')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: enMessages.common.confirm })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: enMessages.common.cancel })).toBeInTheDocument();
  });
});

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';

import { QrDisplay } from '@/components/settle/qr-display';
import csMessages from '@/messages/cs.json';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: vi.fn(), replace: vi.fn() }),
}));

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

const mockConfirmTransfer = vi.fn();
vi.mock('@/app/[locale]/(app)/settle/actions', () => ({
  confirmTransferMadeAction: (...args: unknown[]) => mockConfirmTransfer(...args),
}));

function renderQr(props: Partial<Parameters<typeof QrDisplay>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="cs" messages={csMessages}>
      <QrDisplay
        qrSvg='<svg data-testid="qr-svg"><rect/></svg>'
        amountDisplay="120 Kč"
        variableSymbol="1234567890"
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe('QrDisplay', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockToastSuccess.mockReset();
    mockToastError.mockReset();
    mockConfirmTransfer.mockReset();
  });

  it('renders the SVG QR markup (trusted server-side render)', () => {
    renderQr();
    expect(screen.getByTestId('qr-svg')).toBeInTheDocument();
  });

  it('renders the amount + variable symbol in the details list', () => {
    renderQr();
    expect(screen.getByText('120 Kč')).toBeInTheDocument();
    expect(screen.getByText('1234567890')).toBeInTheDocument();
  });

  it('successful confirm: pushes home and shows success toast', async () => {
    mockConfirmTransfer.mockResolvedValue({ ok: true });
    renderQr();
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(mockConfirmTransfer).toHaveBeenCalledWith({
        variableSymbol: '1234567890',
      });
      expect(mockToastSuccess).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });

  it('CLAIM_PENDING result shows the claim-pending error toast', async () => {
    mockConfirmTransfer.mockResolvedValue({ ok: false, code: 'CLAIM_PENDING' });
    renderQr();
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  it('NO_BALANCE result shows the no-balance error toast', async () => {
    mockConfirmTransfer.mockResolvedValue({ ok: false, code: 'NO_BALANCE' });
    renderQr();
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  it('generic failure falls through to a generic record-failed toast', async () => {
    mockConfirmTransfer.mockResolvedValue({ ok: false, code: 'SOMETHING_ELSE' });
    renderQr();
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalled();
    });
  });
});

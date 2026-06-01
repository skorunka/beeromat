import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { TransferList } from '@/components/bet/transfer-list';
import enMessages from '@/messages/en.json';

const mockCreate = vi.fn();
const mockVoid = vi.fn();
vi.mock('@/app/[locale]/(app)/bet/actions', () => ({
  createBetTransferAction: (...a: unknown[]) => mockCreate(...a),
  voidBetTransferAction: (...a: unknown[]) => mockVoid(...a),
}));

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => mockToastSuccess(...a),
    error: (...a: unknown[]) => mockToastError(...a),
  },
}));

beforeEach(() => {
  mockCreate.mockReset();
  mockVoid.mockReset();
  mockToastSuccess.mockReset();
  mockToastError.mockReset();
});

function renderList(opts: {
  transferables?: React.ComponentProps<typeof TransferList>['transferables'];
  transfers?: React.ComponentProps<typeof TransferList>['transfers'];
  tally?: React.ComponentProps<typeof TransferList>['tally'];
} = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <TransferList
        transferables={opts.transferables ?? []}
        transfers={opts.transfers ?? []}
        tally={opts.tally ?? null}
      />
    </NextIntlClientProvider>,
  );
}

describe('TransferList', () => {
  it('empty state: shows "no other drinks" + omits the "bets this round" header', () => {
    renderList();
    expect(screen.getByText(/nobody else has logged a drink this round/i)).toBeInTheDocument();
    expect(screen.queryByText(/bets this round/i)).not.toBeInTheDocument();
  });

  it('omits the tally card when tally is null', () => {
    renderList();
    expect(screen.queryByText(/from bets this round/i)).not.toBeInTheDocument();
  });

  it('renders the tally card when present', () => {
    renderList({ tally: { count: 2, totalDisplay: '100 Kč' } });
    expect(screen.getByText(/from bets this round: 2 drinks · 100 kč/i)).toBeInTheDocument();
  });

  it('renders each transferable with owner + beer + amount + an "I\'ll take it" button', () => {
    renderList({
      transferables: [
        {
          consumptionId: 'c-1',
          beerTypeName: 'Pilsner',
          ownerMemberId: 'm-bob',
          ownerDisplayName: 'Bob',
          ownerAvatarKey: null,
          ownerAvatarUploadAt: null,
          amountDisplay: '50 Kč',
        },
      ],
    });
    expect(screen.getByText(/pilsner · bob/i)).toBeInTheDocument();
    expect(screen.getByText('50 Kč')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /i'll take it/i })).toBeInTheDocument();
  });

  it('"I\'ll take it" calls createBetTransferAction with the consumption id', async () => {
    mockCreate.mockResolvedValue({ ok: true });
    renderList({
      transferables: [
        {
          consumptionId: 'c-1',
          beerTypeName: 'Pilsner',
          ownerMemberId: 'm-bob',
          ownerDisplayName: 'Bob',
          ownerAvatarKey: null,
          ownerAvatarUploadAt: null,
          amountDisplay: '50 Kč',
        },
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: /i'll take it/i }));
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({ sourceConsumptionId: 'c-1' });
      expect(mockToastSuccess).toHaveBeenCalled();
    });
  });

  it('renders a "bets this round" header when transfers are present', () => {
    renderList({
      transfers: [
        {
          id: 't-1',
          description: 'You took Bob\'s Pilsner',
          counterpartyMemberId: 'm-bob',
          counterpartyDisplayName: 'Bob',
          counterpartyAvatarKey: null,
          counterpartyAvatarUploadAt: null,
          amountDisplay: '50 Kč',
          voided: false,
          canVoid: true,
        },
      ],
    });
    expect(screen.getByText(/bets this round/i)).toBeInTheDocument();
    expect(screen.getByText(/you took bob's pilsner/i)).toBeInTheDocument();
  });

  it('Undo button appears only for transfers the viewer canVoid', () => {
    renderList({
      transfers: [
        {
          id: 't-mine',
          description: 'You took Bob\'s Pilsner',
          counterpartyMemberId: 'm-bob',
          counterpartyDisplayName: 'Bob',
          counterpartyAvatarKey: null,
          counterpartyAvatarUploadAt: null,
          amountDisplay: '50 Kč',
          voided: false,
          canVoid: true,
        },
        {
          id: 't-someone-else',
          description: 'Carol took your Stout',
          counterpartyMemberId: 'm-carol',
          counterpartyDisplayName: 'Carol',
          counterpartyAvatarKey: null,
          counterpartyAvatarUploadAt: null,
          amountDisplay: '50 Kč',
          voided: false,
          canVoid: false,
        },
      ],
    });
    // Exactly one Undo button.
    expect(screen.getAllByRole('button', { name: /undo/i })).toHaveLength(1);
  });

  it('voided transfers render "(undone)" and no Undo button', () => {
    renderList({
      transfers: [
        {
          id: 't-1',
          description: 'You took Bob\'s Pilsner',
          counterpartyMemberId: 'm-bob',
          counterpartyDisplayName: 'Bob',
          counterpartyAvatarKey: null,
          counterpartyAvatarUploadAt: null,
          amountDisplay: '50 Kč',
          voided: true,
          canVoid: false,
        },
      ],
    });
    expect(screen.getByText(/undone/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^undo$/i })).not.toBeInTheDocument();
  });

  it('Undo calls voidBetTransferAction with the transfer id', async () => {
    mockVoid.mockResolvedValue({ ok: true });
    renderList({
      transfers: [
        {
          id: 't-1',
          description: 'You took Bob\'s Pilsner',
          counterpartyMemberId: 'm-bob',
          counterpartyDisplayName: 'Bob',
          counterpartyAvatarKey: null,
          counterpartyAvatarUploadAt: null,
          amountDisplay: '50 Kč',
          voided: false,
          canVoid: true,
        },
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: /undo/i }));
    await waitFor(() => {
      expect(mockVoid).toHaveBeenCalledWith({ betTransferId: 't-1' });
      expect(mockToastSuccess).toHaveBeenCalled();
    });
  });
});

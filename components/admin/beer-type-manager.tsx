'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import {
  archiveBeerTypeAction,
  createBeerTypeAction,
  recordRestockAction,
  recordStockAdjustmentAction,
  unarchiveBeerTypeAction,
  updateBeerTypeAction,
} from '@/app/[locale]/(app)/admin/beer-types/actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface BeerTypeManagerView {
  id: string;
  name: string;
  unitPriceMinor: string;
  priceDisplay: string;
  currentStock: number;
  lowStockThreshold: number;
  isLowStock: boolean;
  isOutOfStock: boolean;
  isArchived: boolean;
}

type DialogState =
  | { kind: 'create' }
  | { kind: 'edit'; beer: BeerTypeManagerView }
  | { kind: 'restock'; beer: BeerTypeManagerView }
  | { kind: 'adjust'; beer: BeerTypeManagerView }
  | null;

/** Major-unit decimal string → integer minor units. */
function toMinor(major: string): bigint | null {
  if (!/^\d+([.,]\d{1,2})?$/.test(major.trim())) return null;
  const [whole = '0', frac = ''] = major.trim().replace(',', '.').split('.');
  return BigInt(whole) * 100n + BigInt(frac.padEnd(2, '0'));
}

export function BeerTypeManager({
  beerTypes,
  currencyCode,
}: {
  beerTypes: BeerTypeManagerView[];
  currencyCode: string;
}) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [threshold, setThreshold] = useState('');
  const [quantity, setQuantity] = useState('');
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [isPending, startTransition] = useTransition();

  function close() {
    setDialog(null);
  }

  function openCreate() {
    setName('');
    setPrice('');
    setStock('0');
    setThreshold('5');
    setDialog({ kind: 'create' });
  }

  function openEdit(beer: BeerTypeManagerView) {
    setName(beer.name);
    setPrice((Number(beer.unitPriceMinor) / 100).toFixed(2));
    setThreshold(String(beer.lowStockThreshold));
    setDialog({ kind: 'edit', beer });
  }

  function openRestock(beer: BeerTypeManagerView) {
    setQuantity('');
    setReason('');
    setDialog({ kind: 'restock', beer });
  }

  function openAdjust(beer: BeerTypeManagerView) {
    setDelta('');
    setReason('');
    setDialog({ kind: 'adjust', beer });
  }

  function handleArchiveToggle(beer: BeerTypeManagerView) {
    startTransition(async () => {
      const result = beer.isArchived
        ? await unarchiveBeerTypeAction(beer.id)
        : await archiveBeerTypeAction(beer.id);
      if (result.ok) toast.success(beer.isArchived ? 'Unarchived.' : 'Archived.');
      else toast.error('Beer type not found.');
    });
  }

  function submitCreate() {
    const priceMinor = toMinor(price);
    if (!name.trim() || priceMinor === null || priceMinor <= 0n) {
      toast.error('Enter a name and a valid price.');
      return;
    }
    startTransition(async () => {
      const result = await createBeerTypeAction({
        name: name.trim(),
        unitPriceMinor: priceMinor.toString(),
        initialStock: Number(stock) || 0,
        lowStockThreshold: Number(threshold) || 0,
      });
      if (result.ok) {
        toast.success('Beer type added.');
        close();
      } else if (result.code === 'DUPLICATE_NAME') {
        toast.error('A beer type with that name already exists.');
      } else {
        toast.error('Check the fields and try again.');
      }
    });
  }

  function submitEdit(beer: BeerTypeManagerView) {
    const priceMinor = toMinor(price);
    if (!name.trim() || priceMinor === null || priceMinor <= 0n) {
      toast.error('Enter a name and a valid price.');
      return;
    }
    startTransition(async () => {
      const result = await updateBeerTypeAction({
        id: beer.id,
        patch: {
          name: name.trim(),
          unitPriceMinor: priceMinor.toString(),
          lowStockThreshold: Number(threshold) || 0,
        },
      });
      if (result.ok) {
        toast.success('Beer type updated.');
        close();
      } else if (result.code === 'DUPLICATE_NAME') {
        toast.error('A beer type with that name already exists.');
      } else {
        toast.error('Could not update the beer type.');
      }
    });
  }

  function submitRestock(beer: BeerTypeManagerView) {
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      toast.error('Enter a positive whole number.');
      return;
    }
    startTransition(async () => {
      const result = await recordRestockAction({
        beerTypeId: beer.id,
        quantity: qty,
        reason: reason.trim() || undefined,
      });
      if (result.ok) {
        toast.success(`Restocked — ${result.newStock} in stock.`);
        close();
      } else if (result.code === 'ARCHIVED') {
        toast.error('Cannot restock an archived beer type.');
      } else {
        toast.error('Could not record the restock.');
      }
    });
  }

  function submitAdjust(beer: BeerTypeManagerView) {
    const d = Number(delta);
    if (!Number.isInteger(d) || d === 0) {
      toast.error('Enter a non-zero whole number (use a minus sign to reduce).');
      return;
    }
    if (!reason.trim()) {
      toast.error('A reason is required for an adjustment.');
      return;
    }
    startTransition(async () => {
      const result = await recordStockAdjustmentAction({
        beerTypeId: beer.id,
        delta: d,
        reason: reason.trim(),
      });
      if (result.ok) {
        toast.success(`Adjusted — ${result.newStock} in stock.`);
        close();
      } else if (result.code === 'WOULD_GO_NEGATIVE') {
        toast.error('That adjustment would take stock below zero.');
      } else {
        toast.error('Could not record the adjustment.');
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Button type="button" onClick={openCreate}>
        Add beer type
      </Button>

      <ul className="flex flex-col gap-2">
        {beerTypes.map((beer) => (
          <li key={beer.id}>
            <Card className={`p-3 ${beer.isArchived ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-medium">
                    {beer.name}
                    {beer.isArchived ? <Badge variant="outline">archived</Badge> : null}
                    {beer.isOutOfStock && !beer.isArchived ? (
                      <Badge variant="destructive">out</Badge>
                    ) : beer.isLowStock && !beer.isArchived ? (
                      <Badge variant="secondary">low</Badge>
                    ) : null}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {beer.priceDisplay} · {beer.currentStock} in stock · alert ≤{' '}
                    {beer.lowStockThreshold}
                  </div>
                </div>
                <Link
                  href={`/admin/beer-types/${beer.id}/history` as Route}
                  className="text-primary shrink-0 text-xs underline"
                >
                  History
                </Link>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {!beer.isArchived ? (
                  <>
                    <Button size="sm" type="button" onClick={() => openRestock(beer)}>
                      Restock
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      type="button"
                      onClick={() => openAdjust(beer)}
                    >
                      Adjust
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      type="button"
                      onClick={() => openEdit(beer)}
                    >
                      Edit
                    </Button>
                  </>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  type="button"
                  disabled={isPending}
                  onClick={() => handleArchiveToggle(beer)}
                >
                  {beer.isArchived ? 'Unarchive' : 'Archive'}
                </Button>
              </div>
            </Card>
          </li>
        ))}
        {beerTypes.length === 0 ? (
          <li className="text-muted-foreground p-4 text-center text-sm">
            No beer types yet — add the first one.
          </li>
        ) : null}
      </ul>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && close()}>
        <DialogContent>
          {dialog?.kind === 'create' || dialog?.kind === 'edit' ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {dialog.kind === 'create' ? 'Add beer type' : 'Edit beer type'}
                </DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-2">
                <Label htmlFor="bt-name">Name</Label>
                <Input id="bt-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="bt-price">Price ({currencyCode})</Label>
                <Input
                  id="bt-price"
                  inputMode="decimal"
                  placeholder="52.00"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>
              {dialog.kind === 'create' ? (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="bt-stock">Initial stock</Label>
                  <Input
                    id="bt-stock"
                    inputMode="numeric"
                    value={stock}
                    onChange={(e) => setStock(e.target.value.replace(/\D/g, ''))}
                  />
                </div>
              ) : null}
              <div className="flex flex-col gap-2">
                <Label htmlFor="bt-threshold">Low-stock alert threshold</Label>
                <Input
                  id="bt-threshold"
                  inputMode="numeric"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value.replace(/\D/g, ''))}
                />
              </div>
              <Button
                type="button"
                disabled={isPending}
                onClick={() =>
                  dialog.kind === 'create' ? submitCreate() : submitEdit(dialog.beer)
                }
              >
                {isPending ? 'Saving…' : 'Save'}
              </Button>
            </>
          ) : null}

          {dialog?.kind === 'restock' ? (
            <>
              <DialogHeader>
                <DialogTitle>Restock {dialog.beer.name}</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-2">
                <Label htmlFor="bt-qty">Quantity received</Label>
                <Input
                  id="bt-qty"
                  inputMode="numeric"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ''))}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="bt-restock-reason">Note (optional)</Label>
                <Input
                  id="bt-restock-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
              <Button type="button" disabled={isPending} onClick={() => submitRestock(dialog.beer)}>
                {isPending ? 'Saving…' : 'Record restock'}
              </Button>
            </>
          ) : null}

          {dialog?.kind === 'adjust' ? (
            <>
              <DialogHeader>
                <DialogTitle>Adjust {dialog.beer.name}</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-2">
                <Label htmlFor="bt-delta">Change (negative to reduce)</Label>
                <Input
                  id="bt-delta"
                  inputMode="numeric"
                  placeholder="-3"
                  value={delta}
                  onChange={(e) => setDelta(e.target.value.replace(/[^\d-]/g, ''))}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="bt-adjust-reason">Reason</Label>
                <Input
                  id="bt-adjust-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
              <Button type="button" disabled={isPending} onClick={() => submitAdjust(dialog.beer)}>
                {isPending ? 'Saving…' : 'Record adjustment'}
              </Button>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

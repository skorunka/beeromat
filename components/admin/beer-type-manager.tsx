'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('admin');
  const tCommon = useTranslations('common');
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
      if (result.ok) toast.success(beer.isArchived ? t('unarchivedToast') : t('archivedToast'));
      else toast.error(t('beerTypeNotFound'));
    });
  }

  function submitCreate() {
    const priceMinor = toMinor(price);
    if (!name.trim() || priceMinor === null || priceMinor <= 0n) {
      toast.error(t('beerTypeFieldsError'));
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
        toast.success(t('beerTypeAdded'));
        close();
      } else if (result.code === 'DUPLICATE_NAME') {
        toast.error(t('duplicateName'));
      } else {
        toast.error(t('beerTypeFieldsError'));
      }
    });
  }

  function submitEdit(beer: BeerTypeManagerView) {
    const priceMinor = toMinor(price);
    if (!name.trim() || priceMinor === null || priceMinor <= 0n) {
      toast.error(t('beerTypeFieldsError'));
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
        toast.success(t('beerTypeUpdated'));
        close();
      } else if (result.code === 'DUPLICATE_NAME') {
        toast.error(t('duplicateName'));
      } else {
        toast.error(t('beerTypeFieldsError'));
      }
    });
  }

  function submitRestock(beer: BeerTypeManagerView) {
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      toast.error(t('invalidQuantity'));
      return;
    }
    startTransition(async () => {
      const result = await recordRestockAction({
        beerTypeId: beer.id,
        quantity: qty,
        reason: reason.trim() || undefined,
      });
      if (result.ok) {
        toast.success(t('restocked', { stock: result.newStock }));
        close();
      } else if (result.code === 'ARCHIVED') {
        toast.error(t('restockArchived'));
      } else {
        toast.error(t('restockFailed'));
      }
    });
  }

  function submitAdjust(beer: BeerTypeManagerView) {
    const d = Number(delta);
    if (!Number.isInteger(d) || d === 0) {
      toast.error(t('invalidDelta'));
      return;
    }
    if (!reason.trim()) {
      toast.error(t('adjustReasonRequired'));
      return;
    }
    startTransition(async () => {
      const result = await recordStockAdjustmentAction({
        beerTypeId: beer.id,
        delta: d,
        reason: reason.trim(),
      });
      if (result.ok) {
        toast.success(t('adjusted', { stock: result.newStock }));
        close();
      } else if (result.code === 'WOULD_GO_NEGATIVE') {
        toast.error(t('wouldGoNegative'));
      } else {
        toast.error(t('adjustmentFailed'));
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Button type="button" onClick={openCreate}>
        {t('addBeerType')}
      </Button>

      <ul className="flex flex-col gap-2">
        {beerTypes.map((beer) => (
          <li key={beer.id}>
            <Card className={`p-3 ${beer.isArchived ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-medium">
                    {beer.name}
                    {beer.isArchived ? <Badge variant="outline">{t('archived')}</Badge> : null}
                    {beer.isOutOfStock && !beer.isArchived ? (
                      <Badge variant="destructive">{t('out')}</Badge>
                    ) : beer.isLowStock && !beer.isArchived ? (
                      <Badge variant="secondary">{t('low')}</Badge>
                    ) : null}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {t('stockSummary', {
                      price: beer.priceDisplay,
                      stock: beer.currentStock,
                      threshold: beer.lowStockThreshold,
                    })}
                  </div>
                </div>
                <Link
                  href={`/admin/beer-types/${beer.id}/history` as Route}
                  className="text-primary shrink-0 text-xs underline"
                >
                  {t('historyLink')}
                </Link>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {!beer.isArchived ? (
                  <>
                    <Button size="lg" type="button" onClick={() => openRestock(beer)}>
                      {t('restock')}
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      type="button"
                      onClick={() => openAdjust(beer)}
                    >
                      {t('adjust')}
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      type="button"
                      onClick={() => openEdit(beer)}
                    >
                      {t('edit')}
                    </Button>
                  </>
                ) : null}
                <Button
                  size="lg"
                  variant="ghost"
                  type="button"
                  disabled={isPending}
                  onClick={() => handleArchiveToggle(beer)}
                >
                  {beer.isArchived ? t('unarchive') : t('archive')}
                </Button>
              </div>
            </Card>
          </li>
        ))}
        {beerTypes.length === 0 ? (
          <li className="text-muted-foreground p-4 text-center text-sm">
            {t('noBeerTypes')}
          </li>
        ) : null}
      </ul>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && close()}>
        <DialogContent>
          {dialog?.kind === 'create' || dialog?.kind === 'edit' ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {dialog.kind === 'create' ? t('addBeerType') : t('editBeerType')}
                </DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-2">
                <Label htmlFor="bt-name">{t('nameLabel')}</Label>
                <Input id="bt-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="bt-price">{t('priceLabel', { currency: currencyCode })}</Label>
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
                  <Label htmlFor="bt-stock">{t('initialStockLabel')}</Label>
                  <Input
                    id="bt-stock"
                    inputMode="numeric"
                    value={stock}
                    onChange={(e) => setStock(e.target.value.replace(/\D/g, ''))}
                  />
                </div>
              ) : null}
              <div className="flex flex-col gap-2">
                <Label htmlFor="bt-threshold">{t('thresholdLabel')}</Label>
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
                {isPending ? tCommon('saving') : tCommon('save')}
              </Button>
            </>
          ) : null}

          {dialog?.kind === 'restock' ? (
            <>
              <DialogHeader>
                <DialogTitle>{t('restockTitle', { name: dialog.beer.name })}</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-2">
                <Label htmlFor="bt-qty">{t('quantityLabel')}</Label>
                <Input
                  id="bt-qty"
                  inputMode="numeric"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ''))}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="bt-restock-reason">{t('restockNoteLabel')}</Label>
                <Input
                  id="bt-restock-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
              <Button type="button" disabled={isPending} onClick={() => submitRestock(dialog.beer)}>
                {isPending ? tCommon('saving') : t('recordRestock')}
              </Button>
            </>
          ) : null}

          {dialog?.kind === 'adjust' ? (
            <>
              <DialogHeader>
                <DialogTitle>{t('adjustTitle', { name: dialog.beer.name })}</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-2">
                <Label htmlFor="bt-delta">{t('deltaLabel')}</Label>
                <Input
                  id="bt-delta"
                  inputMode="numeric"
                  placeholder="-3"
                  value={delta}
                  onChange={(e) => setDelta(e.target.value.replace(/[^\d-]/g, ''))}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="bt-adjust-reason">{t('adjustReasonLabel')}</Label>
                <Input
                  id="bt-adjust-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
              <Button type="button" disabled={isPending} onClick={() => submitAdjust(dialog.beer)}>
                {isPending ? tCommon('saving') : t('recordAdjustment')}
              </Button>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

'use client';

import type { Route } from 'next';
import { Link } from '@/lib/i18n/navigation';
import { useState, useTransition } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormRootError,
} from '@/components/ui/form';
import { toMinor } from '@/lib/validation/money';
import {
  beerTypeCreateSchema,
  beerTypeEditSchema,
} from '@/lib/validation/beer-types';
import { restockSchema, adjustSchema } from '@/lib/validation/stock';

export interface BeerTypeManagerView {
  id: string;
  name: string;
  unitPriceMinor: string;
  priceDisplay: string;
  // Spec 011 — optional buy price + per-unit margin. null when admin
  // hasn't set a buy price yet.
  buyPriceMinor: string | null;
  buyPriceDisplay: string | null;
  marginPerUnitDisplay: string | null;
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

const digitsOnly = (v: string) => v.replace(/\D/g, '');

// --- Create / edit form -----------------------------------------------------

interface BeerFormValues {
  name: string;
  price: string;
  buyPrice: string;
  initialStock: string;
  lowStockThreshold: string;
}

function BeerForm({
  mode,
  beer,
  currencyCode,
  onDone,
}: {
  mode: 'create' | 'edit';
  beer?: BeerTypeManagerView;
  currencyCode: string;
  onDone: () => void;
}) {
  const t = useTranslations('admin');
  const tCommon = useTranslations('common');
  const tForms = useTranslations('forms');
  const [isPending, startTransition] = useTransition();

  const form = useForm<BeerFormValues>({
    resolver: zodResolver(
      mode === 'create' ? beerTypeCreateSchema : beerTypeEditSchema,
    ) as unknown as Resolver<BeerFormValues>,
    defaultValues: {
      name: beer?.name ?? '',
      price: beer ? (Number(beer.unitPriceMinor) / 100).toFixed(2) : '',
      buyPrice: beer?.buyPriceMinor ? (Number(beer.buyPriceMinor) / 100).toFixed(2) : '',
      initialStock: '0',
      lowStockThreshold: beer ? String(beer.lowStockThreshold) : '5',
    },
  });

  function onSubmit(values: BeerFormValues) {
    const priceMinor = toMinor(values.price);
    if (priceMinor === null) return; // schema guarantees this
    // Spec 011 — convert empty buyPrice to null; otherwise parse to
    // minor units. Schema rejects malformed input before we get here.
    const buyMinor = values.buyPrice.trim() === '' ? null : toMinor(values.buyPrice);
    if (buyMinor === null && values.buyPrice.trim() !== '') return;
    const buyPriceMinor = buyMinor === null ? null : buyMinor.toString();
    startTransition(async () => {
      const result =
        mode === 'create'
          ? await createBeerTypeAction({
              name: values.name.trim(),
              unitPriceMinor: priceMinor.toString(),
              buyPriceMinor,
              initialStock: Number(values.initialStock) || 0,
              lowStockThreshold: Number(values.lowStockThreshold) || 0,
            })
          : await updateBeerTypeAction({
              id: beer!.id,
              patch: {
                name: values.name.trim(),
                unitPriceMinor: priceMinor.toString(),
                buyPriceMinor,
                lowStockThreshold: Number(values.lowStockThreshold) || 0,
              },
            });
      if (result.ok) {
        toast.success(t(mode === 'create' ? 'beerTypeAdded' : 'beerTypeUpdated'));
        onDone();
      } else if (result.code === 'DUPLICATE_NAME') {
        form.setError('name', { message: 'admin.duplicateName' });
      } else if (result.code === 'BUY_ABOVE_SELL') {
        form.setError('buyPrice', { message: 'admin.beerTypeBuyAboveSell' });
      } else {
        form.setError('root', { message: 'admin.beerTypeFieldsError' });
      }
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-3">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('nameLabel')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="price"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('priceLabel', { currency: currencyCode })}</FormLabel>
              <FormControl>
                <Input inputMode="decimal" placeholder="52.00" {...field} />
              </FormControl>
              <FormDescription>{tForms('amountHint')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        {/* Spec 011 — optional buy price for margin tracking. */}
        <FormField
          control={form.control}
          name="buyPrice"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('buyPriceLabel', { currency: currencyCode })}</FormLabel>
              <FormControl>
                <Input inputMode="decimal" placeholder="40.00" {...field} />
              </FormControl>
              <FormDescription>{t('buyPriceHint')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        {mode === 'create' ? (
          <FormField
            control={form.control}
            name="initialStock"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('initialStockLabel')}</FormLabel>
                <FormControl>
                  <Input
                    inputMode="numeric"
                    name={field.name}
                    ref={field.ref}
                    value={field.value}
                    onBlur={field.onBlur}
                    onChange={(e) => field.onChange(digitsOnly(e.target.value))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : null}
        <FormField
          control={form.control}
          name="lowStockThreshold"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('thresholdLabel')}</FormLabel>
              <FormControl>
                <Input
                  inputMode="numeric"
                  name={field.name}
                  ref={field.ref}
                  value={field.value}
                  onBlur={field.onBlur}
                  onChange={(e) => field.onChange(digitsOnly(e.target.value))}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormRootError />
        <Button type="submit" disabled={isPending}>
          {isPending ? tCommon('saving') : tCommon('save')}
        </Button>
      </form>
    </Form>
  );
}

// --- Restock form -----------------------------------------------------------

interface RestockValues {
  quantity: string;
  reason: string;
}

function RestockForm({ beer, onDone }: { beer: BeerTypeManagerView; onDone: () => void }) {
  const t = useTranslations('admin');
  const tCommon = useTranslations('common');
  const [isPending, startTransition] = useTransition();

  const form = useForm<RestockValues>({
    resolver: zodResolver(restockSchema),
    defaultValues: { quantity: '', reason: '' },
  });

  function onSubmit(values: RestockValues) {
    startTransition(async () => {
      const result = await recordRestockAction({
        beerTypeId: beer.id,
        quantity: Number(values.quantity),
        reason: values.reason.trim() || undefined,
      });
      if (result.ok) {
        toast.success(t('restocked', { stock: result.newStock }));
        onDone();
      } else if (result.code === 'ARCHIVED') {
        form.setError('root', { message: 'admin.restockArchived' });
      } else {
        form.setError('root', { message: 'admin.restockFailed' });
      }
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-3">
        <FormField
          control={form.control}
          name="quantity"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('quantityLabel')}</FormLabel>
              <FormControl>
                <Input
                  inputMode="numeric"
                  name={field.name}
                  ref={field.ref}
                  value={field.value}
                  onBlur={field.onBlur}
                  onChange={(e) => field.onChange(digitsOnly(e.target.value))}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="reason"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('restockNoteLabel')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormRootError />
        <Button type="submit" disabled={isPending}>
          {isPending ? tCommon('saving') : t('recordRestock')}
        </Button>
      </form>
    </Form>
  );
}

// --- Adjust form ------------------------------------------------------------

interface AdjustValues {
  quantity: string;
  mode: 'add' | 'remove';
  reason: string;
}

function AdjustForm({ beer, onDone }: { beer: BeerTypeManagerView; onDone: () => void }) {
  const t = useTranslations('admin');
  const tCommon = useTranslations('common');
  const [isPending, startTransition] = useTransition();

  const form = useForm<AdjustValues>({
    resolver: zodResolver(adjustSchema),
    defaultValues: { quantity: '', mode: 'add', reason: '' },
  });

  function onSubmit(values: AdjustValues) {
    // The Server Action keeps its signed-delta contract; the form
    // computes the sign so the stock manager never types a negative.
    const quantity = Number(values.quantity);
    const delta = values.mode === 'remove' ? -quantity : quantity;
    startTransition(async () => {
      const result = await recordStockAdjustmentAction({
        beerTypeId: beer.id,
        delta,
        reason: values.reason.trim(),
      });
      if (result.ok) {
        toast.success(t('adjusted', { stock: result.newStock }));
        onDone();
      } else if (result.code === 'WOULD_GO_NEGATIVE') {
        form.setError('root', { message: 'admin.wouldGoNegative' });
      } else {
        form.setError('root', { message: 'admin.adjustmentFailed' });
      }
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-3">
        <FormField
          control={form.control}
          name="mode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('adjustModeLabel')}</FormLabel>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="lg"
                  className="flex-1"
                  variant={field.value === 'add' ? 'default' : 'outline'}
                  aria-pressed={field.value === 'add'}
                  onClick={() => field.onChange('add')}
                >
                  {t('addStock')}
                </Button>
                <Button
                  type="button"
                  size="lg"
                  className="flex-1"
                  variant={field.value === 'remove' ? 'default' : 'outline'}
                  aria-pressed={field.value === 'remove'}
                  onClick={() => field.onChange('remove')}
                >
                  {t('removeStock')}
                </Button>
              </div>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="quantity"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('adjustQuantityLabel')}</FormLabel>
              <FormControl>
                <Input
                  inputMode="numeric"
                  name={field.name}
                  ref={field.ref}
                  value={field.value}
                  onBlur={field.onBlur}
                  onChange={(e) => field.onChange(digitsOnly(e.target.value))}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="reason"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('adjustReasonLabel')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormRootError />
        <Button type="submit" disabled={isPending}>
          {isPending ? tCommon('saving') : t('recordAdjustment')}
        </Button>
      </form>
    </Form>
  );
}

// --- Manager (list + dialog shell) ------------------------------------------

export function BeerTypeManager({
  beerTypes,
  currencyCode,
}: {
  beerTypes: BeerTypeManagerView[];
  currencyCode: string;
}) {
  const t = useTranslations('admin');
  const [dialog, setDialog] = useState<DialogState>(null);
  const [isPending, startTransition] = useTransition();

  function close() {
    setDialog(null);
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

  return (
    <div className="flex flex-col gap-3">
      <Button type="button" onClick={() => setDialog({ kind: 'create' })}>
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
                  {/* Spec 011 — per-unit margin row when buy price set. */}
                  {beer.marginPerUnitDisplay && beer.buyPriceDisplay ? (
                    <div className="text-muted-foreground mt-0.5 text-xs">
                      {t('marginPerUnit', {
                        buy: beer.buyPriceDisplay,
                        margin: beer.marginPerUnitDisplay,
                      })}
                    </div>
                  ) : null}
                </div>
                <Link
                  href={`/admin/beer-types/${beer.id}/history` as Route}
                  className="text-primary shrink-0 text-xs underline"
                >
                  {t('historyLink')}
                </Link>
              </div>
              {/* Restock is the dominant action — full-width and primary;
                  Adjust / Edit / Archive sit below as secondary controls
                  (v1.3 UX review F9). */}
              <div className="mt-2 flex flex-col gap-2">
                {!beer.isArchived ? (
                  <>
                    <Button
                      size="lg"
                      type="button"
                      className="w-full"
                      onClick={() => setDialog({ kind: 'restock', beer })}
                    >
                      {t('restock')}
                    </Button>
                    <div className="flex gap-2">
                      <Button
                        size="lg"
                        variant="outline"
                        type="button"
                        className="flex-1"
                        onClick={() => setDialog({ kind: 'adjust', beer })}
                      >
                        {t('adjust')}
                      </Button>
                      <Button
                        size="lg"
                        variant="outline"
                        type="button"
                        className="flex-1"
                        onClick={() => setDialog({ kind: 'edit', beer })}
                      >
                        {t('edit')}
                      </Button>
                      <Button
                        size="lg"
                        variant="ghost"
                        type="button"
                        className="flex-1"
                        disabled={isPending}
                        onClick={() => handleArchiveToggle(beer)}
                      >
                        {t('archive')}
                      </Button>
                    </div>
                  </>
                ) : (
                  <Button
                    size="lg"
                    variant="ghost"
                    type="button"
                    disabled={isPending}
                    onClick={() => handleArchiveToggle(beer)}
                  >
                    {t('unarchive')}
                  </Button>
                )}
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
          {dialog?.kind === 'create' ? (
            <>
              <DialogHeader>
                <DialogTitle>{t('addBeerType')}</DialogTitle>
              </DialogHeader>
              <BeerForm mode="create" currencyCode={currencyCode} onDone={close} />
            </>
          ) : null}
          {dialog?.kind === 'edit' ? (
            <>
              <DialogHeader>
                <DialogTitle>{t('editBeerType')}</DialogTitle>
              </DialogHeader>
              <BeerForm
                mode="edit"
                beer={dialog.beer}
                currencyCode={currencyCode}
                onDone={close}
              />
            </>
          ) : null}
          {dialog?.kind === 'restock' ? (
            <>
              <DialogHeader>
                <DialogTitle>{t('restockTitle', { name: dialog.beer.name })}</DialogTitle>
              </DialogHeader>
              <RestockForm beer={dialog.beer} onDone={close} />
            </>
          ) : null}
          {dialog?.kind === 'adjust' ? (
            <>
              <DialogHeader>
                <DialogTitle>{t('adjustTitle', { name: dialog.beer.name })}</DialogTitle>
              </DialogHeader>
              <AdjustForm beer={dialog.beer} onDone={close} />
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

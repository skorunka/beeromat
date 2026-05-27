'use client';

import { useState, useTransition } from 'react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { markPaidOtherMethodAction } from '@/app/[locale]/(app)/settle/actions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
  paidOtherMethodSchema,
  type PaidOtherMethodValues,
} from '@/lib/validation/payments';

interface PaidOtherMethodProps {
  /** Outstanding balance in minor units (string-serialised bigint). */
  defaultAmountMinor: string;
  currencyCode: string;
}

/**
 * Records a payment made outside the QR flow (cash handed over, a
 * direct Revolut transfer). Note is mandatory so the treasurer has
 * context when confirming.
 */
export function PaidOtherMethod({ defaultAmountMinor, currencyCode }: PaidOtherMethodProps) {
  const router = useRouter();
  const t = useTranslations('settle');
  const tCommon = useTranslations('common');
  const tForms = useTranslations('forms');
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const form = useForm<PaidOtherMethodValues>({
    resolver: zodResolver(paidOtherMethodSchema),
    defaultValues: {
      amount: (Number(BigInt(defaultAmountMinor)) / 100).toFixed(2),
      note: '',
    },
  });

  function onSubmit(values: PaidOtherMethodValues) {
    const amountMinor = toMinor(values.amount);
    // The schema already guarantees a parseable, positive amount.
    if (amountMinor === null) return;
    startTransition(async () => {
      const result = await markPaidOtherMethodAction({
        amountMinor: amountMinor.toString(),
        note: values.note,
      });
      if (result.ok) {
        toast.success(t('recorded'));
        router.push('/' as Route);
      } else if (result.code === 'CLAIM_PENDING') {
        form.setError('root', { message: 'settle.claimPending' });
      } else {
        form.setError('root', { message: 'settle.recordFailed' });
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-muted-foreground w-full py-2 text-sm underline"
      >
        {t('paidOtherWay')}
      </button>
    );
  }

  return (
    <Card className="p-4">
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          noValidate
          className="flex flex-col gap-3"
        >
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('amountLabel', { currency: currencyCode })}</FormLabel>
                <FormControl>
                  <Input inputMode="decimal" {...field} />
                </FormControl>
                <FormDescription>{tForms('amountHint')}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="note"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('noteLabel')}</FormLabel>
                <FormControl>
                  <Input placeholder={t('notePlaceholder')} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormRootError />
          <Button type="submit" disabled={isPending} isPending={isPending}>
            {isPending ? tCommon('saving') : t('recordPayment')}
          </Button>
        </form>
      </Form>
    </Card>
  );
}

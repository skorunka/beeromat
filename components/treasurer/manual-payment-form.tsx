'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { recordManualPaymentAction } from '@/app/[locale]/(app)/admin/balances/actions';
import { Button } from '@/components/ui/button';
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
  manualPaymentSchema,
  type ManualPaymentValues,
} from '@/lib/validation/payments';

interface ManualPaymentFormProps {
  memberId: string;
  currencyCode: string;
}

/**
 * Treasurer records a cash / out-of-band payment against the member
 * whose detail page this form lives on. The payment is confirmed
 * immediately (treasurer_initiated origin).
 */
export function ManualPaymentForm({ memberId, currencyCode }: ManualPaymentFormProps) {
  const router = useRouter();
  const t = useTranslations('admin');
  const tSettle = useTranslations('settle');
  const tCommon = useTranslations('common');
  const tForms = useTranslations('forms');
  const [isPending, startTransition] = useTransition();

  const form = useForm<ManualPaymentValues>({
    resolver: zodResolver(manualPaymentSchema),
    defaultValues: { amount: '', note: '' },
  });

  function onSubmit(values: ManualPaymentValues) {
    const amountMinor = toMinor(values.amount);
    // The schema already guarantees a parseable, positive amount.
    if (amountMinor === null) return;
    startTransition(async () => {
      const result = await recordManualPaymentAction({
        memberId,
        amountMinor: amountMinor.toString(),
        note: values.note.trim() || undefined,
      });
      if (result.ok) {
        toast.success(t('manualRecorded'));
        form.reset();
        router.refresh();
      } else if (result.code === 'NOT_FOUND') {
        form.setError('root', { message: 'admin.manualMemberNotFound' });
      } else {
        form.setError('root', { message: 'settle.invalidAmount' });
      }
    });
  }

  return (
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
              <FormLabel>{tSettle('amountLabel', { currency: currencyCode })}</FormLabel>
              <FormControl>
                <Input
                  inputMode="decimal"
                  placeholder={t('manualAmountPlaceholder')}
                  {...field}
                />
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
              <FormLabel>{tSettle('noteLabel')}</FormLabel>
              <FormControl>
                <Input placeholder={t('manualNotePlaceholder')} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormRootError />
        <Button type="submit" disabled={isPending} isPending={isPending}>
          {isPending ? tCommon('saving') : tSettle('recordPayment')}
        </Button>
      </form>
    </Form>
  );
}

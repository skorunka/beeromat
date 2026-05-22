'use client';

import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { updateBankingProfileAction } from '@/app/[locale]/(app)/admin/settings/actions';
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
import {
  bankingProfileSchema,
  type BankingProfileValues,
} from '@/lib/validation/banking';

interface BankingFormProps {
  initial: {
    iban: string | null;
    accountHolderName: string | null;
    revolutHandle: string | null;
    defaultQrMessage: string | null;
  };
}

/** Empty string → null (clears the field); otherwise the trimmed value. */
function norm(v: string): string | null {
  return v.trim() === '' ? null : v.trim();
}

export function BankingForm({ initial }: BankingFormProps) {
  const t = useTranslations('admin');
  const tCommon = useTranslations('common');
  const [isPending, startTransition] = useTransition();

  const form = useForm<BankingProfileValues>({
    resolver: zodResolver(bankingProfileSchema),
    defaultValues: {
      iban: initial.iban ?? '',
      accountHolderName: initial.accountHolderName ?? '',
      revolutHandle: initial.revolutHandle ?? '',
      defaultQrMessage: initial.defaultQrMessage ?? '',
    },
  });

  function onSubmit(values: BankingProfileValues) {
    startTransition(async () => {
      const result = await updateBankingProfileAction({
        iban: norm(values.iban),
        accountHolderName: norm(values.accountHolderName),
        revolutHandle: norm(values.revolutHandle),
        defaultQrMessage: norm(values.defaultQrMessage),
      });
      if (result.ok) {
        toast.success(t('bankingSaved'));
      } else if (result.code === 'INVALID_IBAN') {
        form.setError('iban', { message: 'admin.invalidIban' });
      } else {
        form.setError('root', { message: 'admin.bankingFailed' });
      }
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <FormField
          control={form.control}
          name="iban"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('ibanLabel')}</FormLabel>
              <FormControl>
                <Input placeholder={t('ibanPlaceholder')} autoComplete="off" {...field} />
              </FormControl>
              <FormDescription>{t('ibanHint')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="accountHolderName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('accountHolderLabel')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="revolutHandle"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('revolutLabel')}</FormLabel>
              <FormControl>
                <Input placeholder={t('revolutPlaceholder')} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="defaultQrMessage"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('qrMessageLabel')}</FormLabel>
              <FormControl>
                <Input placeholder={t('qrMessagePlaceholder')} maxLength={60} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormRootError />
        <Button type="submit" disabled={isPending}>
          {isPending ? tCommon('saving') : t('saveBanking')}
        </Button>
      </form>
    </Form>
  );
}

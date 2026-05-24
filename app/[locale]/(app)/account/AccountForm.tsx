'use client';

import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { updateAccountAction } from '@/app/[locale]/(app)/account/actions';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { accountSchema, type AccountInput } from '@/lib/validation/account';

interface AccountFormProps {
  initialDisplayName: string;
}

export function AccountForm({ initialDisplayName }: AccountFormProps) {
  const t = useTranslations('account');
  const [isPending, startTransition] = useTransition();

  const form = useForm<AccountInput>({
    resolver: zodResolver(accountSchema),
    defaultValues: { displayName: initialDisplayName },
  });

  function onSubmit(values: AccountInput) {
    startTransition(async () => {
      const result = await updateAccountAction(values);
      if (result.ok) {
        toast.success(t('saved'));
        // Reset the form's dirty state to the saved value so a second
        // submit isn't pre-dirty against the new baseline.
        form.reset(values);
      } else {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          const message = messages[0];
          if (!message) continue;
          form.setError(field as keyof AccountInput, { message });
        }
      }
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <FormField
          control={form.control}
          name="displayName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('displayNameLabel')}</FormLabel>
              <FormControl>
                <Input
                  type="text"
                  autoComplete="name"
                  placeholder={t('displayNamePlaceholder')}
                  maxLength={80}
                  {...field}
                />
              </FormControl>
              <FormDescription>{t('displayNameHint')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isPending}>
          {isPending ? t('saving') : t('save')}
        </Button>
      </form>
    </Form>
  );
}

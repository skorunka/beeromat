'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ChevronDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { createSeriesAction, updateSeriesAction } from '@/app/[locale]/(app)/events/actions';
import { createSeriesSchema, type CreateSeriesInput } from '@/lib/validation/events';

// Weekday labels (1=Mon…7=Sun) localized via Intl — 2024-01-01 is a Monday.
function weekdayLabels(locale: string): { value: number; label: string }[] {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: 'long' });
  return Array.from({ length: 7 }, (_, i) => ({
    value: i + 1,
    label: fmt.format(new Date(2024, 0, 1 + i)),
  }));
}

export interface EditableSeries {
  id: string;
  weekday: number;
  startLocalTime: string;
  placeLabel: string;
  title: string | null;
}

// Create when `series` is absent; edit it when present. `onDone` collapses
// the inline editor after a successful save.
export function SeriesForm({
  series,
  onDone,
}: {
  series?: EditableSeries;
  onDone?: () => void;
} = {}) {
  const t = useTranslations('events.admin');
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isEdit = series != null;

  const form = useForm<CreateSeriesInput>({
    resolver: zodResolver(createSeriesSchema),
    defaultValues: series
      ? {
          weekday: series.weekday,
          startLocalTime: series.startLocalTime,
          placeLabel: series.placeLabel,
          title: series.title ?? undefined,
        }
      : { weekday: 2, startLocalTime: '17:00', placeLabel: '', title: undefined },
  });

  function onSubmit(values: CreateSeriesInput) {
    startTransition(async () => {
      const r = isEdit
        ? await updateSeriesAction({ seriesId: series.id, ...values, title: values.title ?? null })
        : await createSeriesAction(values);
      if (r.ok) {
        toast.success(t(isEdit ? 'updatedToast' : 'createdToast'));
        if (isEdit) {
          onDone?.();
        } else {
          form.reset({ weekday: values.weekday, startLocalTime: values.startLocalTime, placeLabel: '' });
        }
        router.refresh();
      } else {
        form.setError('root', { message: 'events.errors.placeRequired' });
      }
    });
  }

  const days = weekdayLabels(locale);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <FormField
          control={form.control}
          name="weekday"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('weekday')}</FormLabel>
              <FormControl>
                <div className="relative">
                  <select
                    className="border-input bg-background h-11 w-full appearance-none rounded-md border px-3 pr-9 text-sm"
                    value={field.value}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                  >
                    {days.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 opacity-60"
                    aria-hidden
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="startLocalTime"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('time')}</FormLabel>
              <FormControl>
                <Input inputMode="numeric" placeholder="17:00" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="placeLabel"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('place')}</FormLabel>
              <FormControl>
                <Input placeholder={t('placePlaceholder')} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('titleLabel')}</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" size="lg" disabled={isPending} isPending={isPending}>
          {t(isEdit ? 'save' : 'create')}
        </Button>
      </form>
    </Form>
  );
}

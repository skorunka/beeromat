'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Pencil, Power } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { SeriesForm, type EditableSeries } from '@/components/events/series-form';
import { updateSeriesAction } from '@/app/[locale]/(app)/events/actions';
import { cn } from '@/lib/utils';

// Spec 032 US3 — one admin series row: summary + inline edit + an
// activate/deactivate toggle (the seasonal switch — deactivate the
// summer/outdoor set, activate the winter/indoor set). Deactivating only
// stops future generation; it's fully reversible, so no confirm needed.
export function SeriesRow({
  series,
}: {
  series: EditableSeries & { isActive: boolean };
}) {
  const t = useTranslations('events.admin');
  const locale = useLocale();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  const weekdayLabel = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(
    new Date(2024, 0, series.weekday), // 2024-01-01 = Monday
  );

  function toggleActive() {
    startTransition(async () => {
      await updateSeriesAction({ seriesId: series.id, isActive: !series.isActive });
      router.refresh();
    });
  }

  return (
    <Card className={cn('p-3', !series.isActive && 'opacity-60')}>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium">
            {weekdayLabel} · {series.startLocalTime}
          </div>
          <div className="text-muted-foreground text-xs">
            {series.title ? `${series.title} · ` : ''}
            {series.placeLabel}
            {!series.isActive ? ` · ${t('inactive')}` : ''}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          aria-label={t('edit')}
          aria-expanded={editing}
          className="text-muted-foreground hover:text-foreground hover:bg-muted flex size-9 shrink-0 items-center justify-center rounded-md transition-colors"
        >
          <Pencil className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={toggleActive}
          disabled={isPending}
          aria-label={series.isActive ? t('deactivate') : t('activate')}
          className={cn(
            'hover:bg-muted flex size-9 shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-50',
            series.isActive ? 'text-primary' : 'text-muted-foreground',
          )}
        >
          <Power className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {editing ? (
        <div className="border-border mt-3 border-t pt-3">
          <SeriesForm series={series} onDone={() => setEditing(false)} />
        </div>
      ) : null}
    </Card>
  );
}

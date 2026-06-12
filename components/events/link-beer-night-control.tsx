'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ChevronDown } from 'lucide-react';

import { setOccurrenceSessionAction } from '@/app/[locale]/(app)/events/actions';
import { Button } from '@/components/ui/button';

// Spec 032 US5 — admin associates the drink session ("beers from this night")
// with an occurrence. Sessions arrive pre-labelled from the server. Selecting
// + Link sets the association; Unlink clears it.
export function LinkBeerNightControl({
  occurrenceId,
  linkedSessionId,
  sessions,
}: {
  occurrenceId: string;
  linkedSessionId: string | null;
  sessions: { id: string; label: string }[];
}) {
  const t = useTranslations('events');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string>(linkedSessionId ?? '');

  function save(sessionId: string | null) {
    startTransition(async () => {
      const r = await setOccurrenceSessionAction({ occurrenceId, sessionId });
      if (r.ok) toast.success(t('savedToast'));
      else toast.error(t('failedToast'));
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
        {t('admin.linkBeerNight')}
      </span>

      {sessions.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('admin.noSessions')}</p>
      ) : (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <select
              className="border-input bg-background h-11 w-full appearance-none rounded-md border px-3 pr-9 text-sm"
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
              }}
            >
              <option value="">{t('admin.linkPlaceholder')}</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <ChevronDown
              className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 opacity-60"
              aria-hidden
            />
          </div>
          <Button
            type="button"
            disabled={isPending || selected === (linkedSessionId ?? '')}
            isPending={isPending}
            onClick={() => {
              save(selected || null);
            }}
          >
            {t('admin.linkSave')}
          </Button>
        </div>
      )}

      {linkedSessionId ? (
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            save(null);
          }}
          className="text-muted-foreground hover:text-foreground self-start text-xs underline disabled:opacity-50"
        >
          {t('admin.unlink')}
        </button>
      ) : null}
    </div>
  );
}

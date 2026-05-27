'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Trophy } from 'lucide-react';

import {
  recordResultAction,
  reverseResultAction,
} from '@/app/[locale]/(app)/match/actions';
import { Button } from '@/components/ui/button';
import { BeerTile } from '@/components/log/beer-tile';

interface RecordResultFormProps {
  agreementId: string;
  sideALabel: string;
  sideBLabel: string;
  // Spec 018 follow-up + spec 025 — when present (i.e.
  // agreement.forBeer === true and the viewer can record),
  // renders an always-visible tile grid above the "who won"
  // buttons. The first tile ("Auto · {beer}") represents
  // "use the server-side default" and is pre-selected. Tapping
  // any non-Auto tile sets `betBeerOverrideId` on submit.
  betBeerOptions?: Array<{ id: string; name: string }>;
  // Spec 025 — name shown on the Auto tile so the recorder
  // sees what the auto-default will be. Null when the recorder
  // has no last beer (new member) — falls back to a generic
  // localized "Auto · Pivo" / "Auto · Beer" label.
  loserLastBeerName?: string | null;
}

interface RecentRecord {
  side: 'A' | 'B';
  transferredCount: number;
  requestedCount: number;
}

const UNDO_WINDOW_MS = 5 * 60 * 1000;

export function RecordResultForm({
  agreementId,
  sideALabel,
  sideBLabel,
  betBeerOptions,
  loserLastBeerName,
}: RecordResultFormProps) {
  const t = useTranslations('match');
  const router = useRouter();
  const [isRecording, startRecord] = useTransition();
  const [isReversing, startReverse] = useTransition();
  const [recent, setRecent] = useState<RecentRecord | null>(null);
  // Spec 025 — picker selection. null = Auto tile selected
  // (use server-side default); any string = that beer's id
  // is sent as `betBeerOverrideId` on submit.
  const [betBeerOverrideId, setBetBeerOverrideId] = useState<string | null>(null);

  function record(side: 'A' | 'B') {
    startRecord(async () => {
      const result = await recordResultAction({
        agreementId,
        winningSide: side,
        ...(betBeerOverrideId ? { betBeerOverrideId } : {}),
      });
      if (!result.ok) {
        if (result.code === 'NOT_AUTHORIZED') toast.error(t('errors.notAuthorized'));
        else if (result.code === 'ALREADY_RECORDED') toast.error(t('errors.alreadyRecorded'));
        else if (result.code === 'CANCELLED') toast.error(t('errors.cancelled'));
        else if (result.code === 'NO_BEER_IN_STOCK') toast.error(t('errors.noBeerInStock'));
        else toast.error(t('errors.generic'));
        router.refresh();
        return;
      }
      const sideName = side === 'A' ? sideALabel : sideBLabel;
      toast.success(t('recordedToast', { side: sideName }));
      setRecent({
        side,
        transferredCount: result.transferredCount,
        requestedCount: result.requestedCount,
      });
      // Schedule auto-clear of the undo affordance once the window expires
      // so the toast/UI doesn't promise an undo that the server will reject.
      window.setTimeout(() => setRecent((r) => (r?.side === side ? null : r)), UNDO_WINDOW_MS);
      router.refresh();
    });
  }

  function reverse() {
    startReverse(async () => {
      const result = await reverseResultAction({ agreementId });
      if (!result.ok) {
        if (result.code === 'UNDO_WINDOW_EXPIRED') toast.error(t('undoWindowExpired'));
        else if (result.code === 'NOT_AUTHORIZED') toast.error(t('errors.notAuthorized'));
        else toast.error(t('errors.generic'));
        return;
      }
      toast.success(t('reversedToast'));
      setRecent(null);
      router.refresh();
    });
  }

  if (recent) {
    return (
      <div className="border-border bg-muted/30 flex flex-col gap-3 rounded-md border p-4">
        <p className="text-sm">
          {recent.transferredCount === recent.requestedCount
            ? t('recordedConfirm', { count: recent.transferredCount })
            : t('recordedPartial', {
                transferred: recent.transferredCount,
                requested: recent.requestedCount,
              })}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isReversing}
          isPending={isReversing}
          onClick={reverse}
          className="self-end"
        >
          {t('undo')}
        </Button>
      </div>
    );
  }

  // Spec 025 — Auto tile label. Use the recorder's last-beer
  // name when we have it; otherwise the localized fallback.
  const autoLabel = loserLastBeerName
    ? t('betPicker.autoLabel', { beer: loserLastBeerName })
    : t('betPicker.autoFallback');

  return (
    <div className="flex flex-col gap-3">
      {betBeerOptions && betBeerOptions.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            aria-pressed={betBeerOverrideId === null}
            onClick={() => setBetBeerOverrideId(null)}
            className={`flex h-16 items-center justify-center rounded-md border px-3 text-base font-medium transition-colors ${
              betBeerOverrideId === null
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-input bg-background hover:bg-accent'
            }`}
          >
            <span className="truncate">{autoLabel}</span>
          </button>
          {betBeerOptions.map((b) => (
            <BeerTile
              key={b.id}
              beer={b}
              selected={betBeerOverrideId === b.id}
              onClick={() => setBetBeerOverrideId(b.id)}
            />
          ))}
        </div>
      ) : null}

      <p className="text-muted-foreground text-sm">{t('whoWon')}</p>
      <div className="grid grid-cols-1 gap-2">
        <Button
          type="button"
          size="lg"
          disabled={isRecording}
          onClick={() => record('A')}
          className="h-16 gap-2 text-base"
        >
          <Trophy className="h-5 w-5" aria-hidden />
          {t('sideWonCta', { side: sideALabel })}
        </Button>
        <Button
          type="button"
          size="lg"
          disabled={isRecording}
          onClick={() => record('B')}
          className="h-16 gap-2 text-base"
        >
          <Trophy className="h-5 w-5" aria-hidden />
          {t('sideWonCta', { side: sideBLabel })}
        </Button>
      </div>
    </div>
  );
}

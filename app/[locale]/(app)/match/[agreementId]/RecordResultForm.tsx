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

interface RecordResultFormProps {
  agreementId: string;
  sideALabel: string;
  sideBLabel: string;
  // Spec 030 — recording no longer settles. For a for-beer match we
  // just show the passive "loser owes N beer" explainer; the beer was
  // chosen at create and the IOU is delivered later ("Předáno").
  forBeer?: boolean;
  loserBeerCount?: number;
}

const UNDO_WINDOW_MS = 5 * 60 * 1000;

export function RecordResultForm({
  agreementId,
  sideALabel,
  sideBLabel,
  forBeer = false,
  loserBeerCount = 1,
}: RecordResultFormProps) {
  const t = useTranslations('match');
  const router = useRouter();
  const [isRecording, startRecord] = useTransition();
  const [isReversing, startReverse] = useTransition();
  const [recordedSide, setRecordedSide] = useState<'A' | 'B' | null>(null);

  function record(side: 'A' | 'B') {
    startRecord(async () => {
      const result = await recordResultAction({ agreementId, winningSide: side });
      if (!result.ok) {
        if (result.code === 'NOT_AUTHORIZED') toast.error(t('errors.notAuthorized'));
        else if (result.code === 'ALREADY_RECORDED') toast.error(t('errors.alreadyRecorded'));
        else if (result.code === 'CANCELLED') toast.error(t('errors.cancelled'));
        else toast.error(t('errors.generic'));
        router.refresh();
        return;
      }
      const sideName = side === 'A' ? sideALabel : sideBLabel;
      toast.success(t('recordedToast', { side: sideName }));
      setRecordedSide(side);
      // Auto-clear the undo affordance once the reverse window expires.
      window.setTimeout(() => setRecordedSide((s) => (s === side ? null : s)), UNDO_WINDOW_MS);
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
      setRecordedSide(null);
      router.refresh();
    });
  }

  if (recordedSide) {
    return (
      <div className="border-border bg-muted/30 flex flex-col gap-3 rounded-md border p-4">
        <p className="text-sm">{forBeer ? t('recordedPending') : t('recordedFriendly')}</p>
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

  return (
    <div className="flex flex-col gap-3">
      {forBeer ? (
        <p className="text-muted-foreground text-xs">{t('loserBuys', { count: loserBeerCount })}</p>
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

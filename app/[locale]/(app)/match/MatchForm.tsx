'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Trophy, Beer } from 'lucide-react';

import { logMatchAction, voidMatchAction } from '@/app/[locale]/(app)/match/actions';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { logMatchSchema, type LogMatchInput } from '@/lib/validation/match';

interface OpponentOption {
  id: string;
  displayName: string;
}

interface MatchFormProps {
  opponents: OpponentOption[];
}

interface RecentMatch {
  id: string;
  opponentName: string;
  outcome: 'won' | 'lost';
  transferredCount: number;
  requestedCount: number;
}

export function MatchForm({ opponents }: MatchFormProps) {
  const t = useTranslations('match');
  const [isPending, startTransition] = useTransition();
  const [undoPending, startUndoTransition] = useTransition();
  const [recent, setRecent] = useState<RecentMatch | null>(null);

  const form = useForm<LogMatchInput>({
    resolver: zodResolver(logMatchSchema),
    defaultValues: { opponentMemberId: opponents[0]?.id ?? '', outcome: 'won' },
  });

  function submit(outcome: 'won' | 'lost') {
    const values = form.getValues();
    if (!values.opponentMemberId) {
      form.setError('opponentMemberId', { message: 'match.errors.opponentRequired' });
      return;
    }
    startTransition(async () => {
      const result = await logMatchAction({
        opponentMemberId: values.opponentMemberId,
        outcome,
      });
      if (!result.ok) {
        if (result.code === 'VALIDATION_FAILED') {
          for (const [field, messages] of Object.entries(result.fieldErrors)) {
            const message = messages[0];
            if (!message) continue;
            form.setError(field as keyof LogMatchInput, { message });
          }
        } else if (result.code === 'SELF_MATCH') {
          toast.error(t('errors.selfMatch'));
        }
        return;
      }
      const opponentName =
        opponents.find((o) => o.id === values.opponentMemberId)?.displayName ?? '';
      const toastMessage = outcome === 'won' ? 'winToast' : 'lostToast';
      toast.success(t(toastMessage, { opponent: opponentName }));
      setRecent({
        id: result.matchId,
        opponentName,
        outcome,
        transferredCount: result.transferredCount,
        requestedCount: result.requestedCount,
      });
    });
  }

  function undo() {
    if (!recent) return;
    startUndoTransition(async () => {
      const result = await voidMatchAction(recent.id);
      if (result.ok) {
        toast.success(t('undone'));
        setRecent(null);
      } else if (result.code === 'UNDO_WINDOW_EXPIRED') {
        toast.error(t('undoWindowExpired'));
      } else {
        toast.error(t('errors.generic'));
      }
    });
  }

  if (opponents.length === 0) {
    return (
      <p className="text-muted-foreground p-6 text-center text-sm">{t('noOpponents')}</p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Form {...form}>
        <form noValidate className="flex flex-col gap-4">
          <FormField
            control={form.control}
            name="opponentMemberId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('opponentLabel')}</FormLabel>
                <FormControl>
                  <select
                    {...field}
                    className="border-input bg-background hover:bg-accent inline-flex h-14 w-full items-center rounded-md border px-3 text-base"
                  >
                    {opponents.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.displayName}
                      </option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              size="lg"
              disabled={isPending}
              onClick={() => submit('won')}
              className="h-16 gap-2 text-lg"
            >
              <Trophy className="h-5 w-5" aria-hidden />
              {isPending ? t('logging') : t('iWon')}
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              disabled={isPending}
              onClick={() => submit('lost')}
              className="h-16 gap-2 text-lg"
            >
              <Beer className="h-5 w-5" aria-hidden />
              {isPending ? t('logging') : t('iLost')}
            </Button>
          </div>
        </form>
      </Form>

      {recent ? (
        <div className="border-border bg-muted/30 flex flex-col gap-2 rounded-md border p-4">
          <div className="text-sm">
            {recent.transferredCount === recent.requestedCount
              ? null
              : recent.transferredCount > 0
                ? t('partialTransferNote', {
                    transferred: recent.transferredCount,
                    requested: recent.requestedCount,
                    opponent: recent.opponentName,
                  })
                : t('noTransferNote', { opponent: recent.opponentName })}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={undoPending}
            onClick={undo}
            className="self-end"
          >
            {t('undo')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

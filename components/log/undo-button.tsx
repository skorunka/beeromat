'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { voidConsumptionAction } from '@/app/[locale]/(app)/log/actions';

interface UndoButtonProps {
  consumptionId: string;
}

export function UndoButton({ consumptionId }: UndoButtonProps) {
  const t = useTranslations('common');
  const [isPending, startTransition] = useTransition();

  function handleUndo() {
    startTransition(async () => {
      const result = await voidConsumptionAction({ consumptionId });
      if (result.ok) {
        toast.success(t('back'));
      } else {
        toast.error(t('error'));
      }
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleUndo}
      disabled={isPending}
    >
      {t('back')}
    </Button>
  );
}

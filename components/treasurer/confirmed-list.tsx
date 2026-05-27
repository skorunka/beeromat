'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { voidConfirmedPaymentAction } from '@/app/[locale]/(app)/admin/pending/actions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { avatarUploadUrl } from '@/lib/avatars/upload-url';

export interface ConfirmedPaymentView {
  paymentId: string;
  memberId: string;
  memberDisplayName: string;
  memberAvatarKey: string | null;
  memberAvatarUploadAt: Date | null;
  amountDisplay: string;
  confirmedAtDisplay: string;
}

/**
 * US4 — recently confirmed payments with a one-way-door escape: the
 * treasurer can reverse a mistaken confirmation, with a reason, via the
 * existing voidConfirmedPaymentAction (constitution Principle V).
 */
export function ConfirmedList({ payments }: { payments: ConfirmedPaymentView[] }) {
  const t = useTranslations('treasurer');
  const tCommon = useTranslations('common');
  const [undoTarget, setUndoTarget] = useState<ConfirmedPaymentView | null>(null);
  const [reason, setReason] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleUndo() {
    if (!undoTarget || !reason.trim()) return;
    const target = undoTarget;
    startTransition(async () => {
      const result = await voidConfirmedPaymentAction({
        paymentId: target.paymentId,
        reason: reason.trim(),
      });
      if (result.ok) {
        toast.success(t('undone'));
        setUndoTarget(null);
        setReason('');
      } else if (result.code === 'INVALID_STATE') {
        toast.error(t('noLongerPending'));
      } else {
        toast.error(t('undoFailed'));
      }
    });
  }

  if (payments.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="mb-2 text-sm font-medium">{t('confirmedTitle')}</h2>
      <ul className="flex flex-col gap-2">
        {payments.map((p) => (
          <li key={p.paymentId}>
            <Card className="flex flex-col gap-3 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <MemberAvatar
                    size="row"
                    avatarKey={p.memberAvatarKey}
                    displayName={p.memberDisplayName}
                    uploadUrl={avatarUploadUrl(p.memberId, p.memberAvatarUploadAt)}
                  />
                  <div className="min-w-0">
                    <div className="font-semibold">{p.memberDisplayName}</div>
                    <div className="text-muted-foreground text-xs">{p.confirmedAtDisplay}</div>
                  </div>
                </div>
                <div className="font-mono text-base font-semibold">{p.amountDisplay}</div>
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-11"
                disabled={isPending}
                isPending={isPending}
                onClick={() => setUndoTarget(p)}
              >
                {t('undoConfirmation')}
              </Button>
            </Card>
          </li>
        ))}
      </ul>

      <Dialog
        open={undoTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setUndoTarget(null);
            setReason('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('undoTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            {undoTarget
              ? t('undoBody', {
                  name: undoTarget.memberDisplayName,
                  amount: undoTarget.amountDisplay,
                })
              : null}
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 500))}
            placeholder={t('undoReasonPlaceholder')}
            rows={3}
            className="border-input bg-background w-full rounded-md border p-2 text-sm"
          />
          <Button
            type="button"
            variant="destructive"
            disabled={isPending || !reason.trim()}
            onClick={handleUndo}
          >
            {isPending ? tCommon('saving') : t('undoSubmit')}
          </Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}

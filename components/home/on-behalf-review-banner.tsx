'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ArrowRight, Beer } from 'lucide-react';

import {
  dismissOnBehalfReviewAction,
  voidConsumptionAction,
} from '@/app/[locale]/(app)/log/actions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { avatarUploadUrl } from '@/lib/avatars/upload-url';

// Spec 019 — proactive notification on home listing every
// on-behalf log made for the consumer since their previous
// review action. Two buttons per row: Vrátit (void + dismiss)
// and Nechat (dismiss only — consumption stays).
//
// Spec 026 — logger avatar (inline size) renders before the
// logger name in the message, matching the spec 023 treatment
// on every other on-behalf surface (/tab "od X", /admin/pending,
// etc.).

export interface OnBehalfReviewBannerRow {
  consumptionId: string;
  loggerDisplayName: string;
  /** Spec 026 — logger member id + avatar fields. The query
   *  always returns the logger as same-club, so loggerMemberId
   *  is non-null in practice; we keep null in the type for the
   *  hard-delete edge case. */
  loggerMemberId: string | null;
  loggerAvatarKey: string | null;
  loggerAvatarUploadAt: Date | null;
  beerName: string;
}

export function OnBehalfReviewBanner({ rows }: { rows: OnBehalfReviewBannerRow[] }) {
  const t = useTranslations('home.onBehalfReview');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (rows.length === 0) return null;

  function handleReject(row: OnBehalfReviewBannerRow) {
    startTransition(async () => {
      // Void first (the destructive action). If that fails, don't
      // dismiss — leave the banner so the user can retry.
      const voidResult = await voidConsumptionAction({ consumptionId: row.consumptionId });
      if (!voidResult.ok) {
        toast.error(t('toastError'));
        return;
      }
      // Stamp the review so the banner row disappears even if the
      // consumer comes back later (the void already would have
      // hidden it, but the dismiss is defensive).
      await dismissOnBehalfReviewAction({ consumptionId: row.consumptionId });
      toast.success(t('toastRejected'));
      router.refresh();
    });
  }

  function handleKeep(row: OnBehalfReviewBannerRow) {
    startTransition(async () => {
      const result = await dismissOnBehalfReviewAction({ consumptionId: row.consumptionId });
      if (!result.ok && result.code !== 'ALREADY_REVIEWED') {
        toast.error(t('toastError'));
        return;
      }
      toast.success(t('toastKept'));
      router.refresh();
    });
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
        {t('heading')}
      </p>
      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.consumptionId} className="flex flex-col gap-2">
            {/* Spec 019 refine — show the DIRECTION the beer travelled: from the
                logger → onto YOUR tab (logger avatar → 🍺). Makes it clear this
                is a charge that landed on your account, not a gift or a request. */}
            <p className="inline-flex flex-wrap items-center gap-1.5 text-sm leading-snug">
              {row.loggerMemberId ? (
                <>
                  <MemberAvatar
                    size="inline"
                    avatarKey={row.loggerAvatarKey}
                    displayName={row.loggerDisplayName}
                    uploadUrl={avatarUploadUrl(row.loggerMemberId, row.loggerAvatarUploadAt)}
                  />
                  <ArrowRight className="text-muted-foreground inline-block h-3.5 w-3.5 shrink-0" aria-hidden />
                </>
              ) : null}
              <Beer className="text-primary inline-block h-4 w-4 shrink-0" aria-hidden />
              <span>
                {t('one', { logger: row.loggerDisplayName, beer: row.beerName })}
              </span>
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() => handleReject(row)}
              >
                {t('reject')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isPending}
                onClick={() => handleKeep(row)}
              >
                {t('keep')}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

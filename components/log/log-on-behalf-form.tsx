'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { logBeerOnBehalfAction } from '@/app/[locale]/(app)/log/actions';
import { Button } from '@/components/ui/button';

// Spec 019 — single-screen on-behalf log form. Member select on
// top, beer grid below, submit at bottom. The submit button is
// disabled until both a member and a beer are picked.

interface MemberOption {
  id: string;
  displayName: string;
}
interface BeerOption {
  id: string;
  name: string;
  currentStock: number;
}

export function LogOnBehalfForm({
  members,
  beers,
}: {
  members: MemberOption[];
  beers: BeerOption[];
}) {
  const t = useTranslations('log.onBehalf');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [memberId, setMemberId] = useState<string>('');
  const [beerId, setBeerId] = useState<string>('');

  const member = members.find((m) => m.id === memberId);
  const beer = beers.find((b) => b.id === beerId);
  const canSubmit = !!memberId && !!beerId && !isPending;

  function handleSubmit() {
    if (!canSubmit || !member || !beer) return;
    startTransition(async () => {
      const result = await logBeerOnBehalfAction({
        beerTypeId: beerId,
        targetMemberId: memberId,
      });
      if (!result.ok) {
        if (result.code === 'TARGET_IS_SELF') toast.error(t('errors.targetSelf'));
        else if (result.code === 'TARGET_NOT_IN_CLUB') toast.error(t('errors.targetNotInClub'));
        else toast.error(t('toastError'));
        return;
      }
      toast.success(t('toastLogged', { beer: beer.name, member: member.displayName }));
      router.push('/' as unknown as Parameters<typeof router.push>[0]);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <label htmlFor="onBehalfMember" className="text-sm font-medium">
          {t('memberHint')}
        </label>
        <select
          id="onBehalfMember"
          value={memberId}
          onChange={(e) => setMemberId(e.target.value)}
          className="border-input bg-background h-12 rounded-md border px-3 text-base"
        >
          <option value="">—</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
        </select>
      </section>

      <section className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          {beers.map((b) => {
            const isSelected = beerId === b.id;
            const disabled = b.currentStock <= 0;
            return (
              <button
                key={b.id}
                type="button"
                disabled={disabled}
                onClick={() => setBeerId(b.id)}
                className={`flex h-16 items-center justify-center rounded-md border px-3 text-base font-medium transition-colors ${
                  isSelected
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-input bg-background hover:bg-accent'
                } ${disabled ? 'opacity-50' : ''}`}
              >
                {b.name}
              </button>
            );
          })}
        </div>
      </section>

      <Button
        type="button"
        size="lg"
        disabled={!canSubmit}
        onClick={handleSubmit}
        className="h-14 text-base"
      >
        {isPending
          ? t('submitting')
          : member && beer
            ? t('submitCta', { beer: beer.name, member: member.displayName })
            : t('memberHint')}
      </Button>
    </div>
  );
}

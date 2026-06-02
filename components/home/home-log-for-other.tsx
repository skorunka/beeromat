'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { UserPlus, X } from 'lucide-react';

import { logBeerOnBehalfAction } from '@/app/[locale]/(app)/log/actions';
import { celebrateBeer } from '@/lib/celebrate';
import { Button } from '@/components/ui/button';
import { MemberPickerDropdown } from '@/components/picker/member-picker-dropdown';
import { BeerPickerDropdown, type BeerPickerOption } from '@/components/picker/beer-picker-dropdown';
import type { MemberOption } from '@/components/picker/types';

// Spec 029 — inline on-behalf log on home. Collapsed by default (a
// compact affordance that doesn't compete with the member's own
// one-tap self-log); expands in place into member + beer dropdowns
// + Log. Logging stays on home (no navigation): the action runs,
// celebrate + toast, router.refresh() updates the round breakdown,
// and selections persist so logging a table's round is a couple of
// taps. Rendered by the home page only when other members exist.

interface HomeLogForOtherProps {
  members: MemberOption[];
  beers: BeerPickerOption[];
  currencyCode: string;
  locale: string;
}

export function HomeLogForOther({ members, beers, currencyCode, locale }: HomeLogForOtherProps) {
  const t = useTranslations('log.onBehalf');
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [beerId, setBeerId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const member = members.find((m) => m.id === memberId);
  const beer = beers.find((b) => b.id === beerId);
  const canLog = !!memberId && !!beerId && !isPending;

  function log() {
    if (!canLog || !member || !beer) return;
    startTransition(async () => {
      const result = await logBeerOnBehalfAction({
        beerTypeId: beer.id,
        targetMemberId: member.id,
      });
      if (!result.ok) {
        if (result.code === 'TARGET_IS_SELF') toast.error(t('errors.targetSelf'));
        else if (result.code === 'TARGET_NOT_IN_CLUB') toast.error(t('errors.targetNotInClub'));
        else toast.error(t('toastError'));
        return;
      }
      celebrateBeer();
      toast.success(t('toastLogged', { beer: beer.name, member: member.displayName }));
      // Stay on home, refresh the round breakdown in place, keep the
      // selections set so the next beer for the table is one tap.
      router.refresh();
    });
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="text-muted-foreground hover:text-foreground inline-flex min-h-9 items-center justify-center gap-1.5 self-center text-sm underline-offset-4 hover:underline"
      >
        <UserPlus className="h-4 w-4" aria-hidden />
        {t('ctaLink')}
      </button>
    );
  }

  return (
    <div className="border-border flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{t('title')}</span>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          aria-label={t('collapse')}
          className="text-muted-foreground hover:text-foreground inline-flex h-8 w-8 items-center justify-center rounded-md"
        >
          <X className="h-[1.1rem] w-[1.1rem]" strokeWidth={2.5} aria-hidden />
        </button>
      </div>

      <MemberPickerDropdown
        members={members}
        value={memberId}
        onChange={setMemberId}
        placeholder={t('memberHint')}
        ariaLabel={t('memberHint')}
      />

      <BeerPickerDropdown
        beers={beers}
        value={beerId}
        onChange={setBeerId}
        currencyCode={currencyCode}
        locale={locale}
        placeholder={t('beerHint')}
        ariaLabel={t('beerHint')}
      />

      <Button
        type="button"
        size="lg"
        disabled={!canLog}
        isPending={isPending}
        onClick={log}
        className="h-12 text-base"
      >
        {member && beer ? t('submitCta', { beer: beer.name, member: member.displayName }) : t('logCta')}
      </Button>
    </div>
  );
}

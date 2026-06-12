'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { UserPlus, X } from 'lucide-react';

import { logRoundAction } from '@/app/[locale]/(app)/log/actions';
import { celebrateBeer } from '@/lib/celebrate';
import { Button } from '@/components/ui/button';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { avatarUploadUrl } from '@/lib/avatars/upload-url';
import {
  MemberMultiSelect,
  type RoundMemberOption,
} from '@/components/picker/member-multi-select';
import { BeerPickerDropdown, type BeerPickerOption } from '@/components/picker/beer-picker-dropdown';

// Spec 033 — "log a round". Collapsed affordance (spec-029 inline
// pattern) that expands to: a default beer + an avatar multi-select
// (logger pre-selected) + an optional per-person override + one submit
// that logs a beer on EACH drinker's own tab via logRoundAction. Stays
// on home: celebrate + toast + router.refresh() + reset selection.

interface RoundLoggerProps {
  /** Active roster INCLUDING the logger (flagged isSelf, sorted first). */
  members: RoundMemberOption[];
  beers: BeerPickerOption[];
  /** The logger's usual/last beer — pre-fills the round default. */
  defaultBeerTypeId: string | null;
  currencyCode: string;
  locale: string;
}

export function RoundLogger({
  members,
  beers,
  defaultBeerTypeId,
  currencyCode,
  locale,
}: RoundLoggerProps) {
  const t = useTranslations('round');
  const router = useRouter();
  const self = members.find((m) => m.isSelf) ?? null;

  const [expanded, setExpanded] = useState(false);
  const [defaultBeerId, setDefaultBeerId] = useState<string | null>(defaultBeerTypeId);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(self ? [self.id] : []));
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [showOverrides, setShowOverrides] = useState(false);
  const [isPending, startTransition] = useTransition();

  // "Repeat last round" — remember the last submitted drinker set on this
  // device (keyed by the member). Lets a regular table re-pick its crew in
  // one tap. localStorage is client-only; read it after mount.
  const storageKey = self ? `beeromat:round:${self.id}` : null;
  const [lastRound, setLastRound] = useState<string[]>([]);
  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        // One-time read of a platform API (localStorage) after mount —
        // a lazy useState initializer would run during SSR (no window)
        // and mismatch on hydration, so the effect is the correct place.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLastRound(JSON.parse(raw) as string[]);
      }
    } catch {
      /* ignore malformed / unavailable storage */
    }
  }, [storageKey]);
  // Only the saved members still in the roster (people may have left).
  const validLastRound = lastRound.filter((id) => members.some((m) => m.id === id));

  const count = selected.size;
  const beerFor = (id: string): string | null => overrides[id] ?? defaultBeerId;
  const allHaveBeer = [...selected].every((id) => Boolean(beerFor(id)));
  const canLog = count > 0 && allHaveBeer && !isPending;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setOverride(id: string, beerId: string | null) {
    setOverrides((prev) => {
      const next = { ...prev };
      // Choosing the round default (or clearing) drops the override.
      if (!beerId || beerId === defaultBeerId) delete next[id];
      else next[id] = beerId;
      return next;
    });
  }

  function reset() {
    setSelected(new Set(self ? [self.id] : []));
    setOverrides({});
    setShowOverrides(false);
  }

  function submit() {
    if (!canLog) return;
    const memberIds = [...selected];
    const items = memberIds.map((id) => ({ memberId: id, beerTypeId: beerFor(id)! }));
    const nameOf = (id: string) => members.find((m) => m.id === id)?.displayName ?? '';
    startTransition(async () => {
      const result = await logRoundAction({ items });
      if (!result.ok) {
        toast.error(result.code === 'ALL_SKIPPED' ? t('toastAllSkipped') : t('toastError'));
        if (result.code === 'ALL_SKIPPED') router.refresh();
        return;
      }
      // Remember this crew for one-tap "repeat last round".
      if (storageKey) {
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(memberIds));
        } catch {
          /* ignore */
        }
        setLastRound(memberIds);
      }
      celebrateBeer();
      if (result.skipped.length > 0) {
        const names = result.skipped.map((s) => nameOf(s.memberId)).filter(Boolean).join(', ');
        toast.success(t('toastLoggedPartial', { names }));
      } else {
        toast.success(t('toastLogged', { count: result.logged.length }));
      }
      // Stay on home, refresh the round breakdown in place, reset for the
      // next round (keep the default beer for fast re-rounds).
      router.refresh();
      reset();
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

      <BeerPickerDropdown
        beers={beers}
        value={defaultBeerId}
        onChange={setDefaultBeerId}
        currencyCode={currencyCode}
        locale={locale}
        placeholder={t('defaultBeerHint')}
        ariaLabel={t('defaultBeerHint')}
      />

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground text-xs font-medium">{t('drinkersHint')}</span>
          {/* One-tap re-pick of the last round's crew (people still here). */}
          {validLastRound.length > 0 ? (
            <button
              type="button"
              onClick={() => setSelected(new Set(validLastRound))}
              className="text-primary text-xs font-medium underline-offset-4 hover:underline"
            >
              {t('repeatLast', { count: validLastRound.length })}
            </button>
          ) : null}
        </div>
        <MemberMultiSelect
          members={members}
          selected={selected}
          onToggle={toggle}
          selfLabel={t('self')}
          searchPlaceholder={t('searchHint')}
        />
      </div>

      {/* Per-person override (US2) — opt-in to keep the same-beer round
          clean. Each selected drinker gets a beer picker; choosing the
          round default clears the override. */}
      {count > 0 && beers.length > 1 ? (
        showOverrides ? (
          <div className="border-border/60 flex flex-col gap-2 rounded-md border p-2">
            {[...selected].map((id) => {
              const m = members.find((mm) => mm.id === id);
              if (!m) return null;
              return (
                <div key={id} className="flex items-center gap-2">
                  <MemberAvatar
                    size="row"
                    avatarKey={m.avatarKey}
                    displayName={m.displayName}
                    uploadUrl={avatarUploadUrl(m.id, m.avatarUploadAt)}
                  />
                  <span className="w-14 shrink-0 truncate text-xs font-medium">
                    {m.isSelf ? t('self') : m.displayName.split(' ')[0]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <BeerPickerDropdown
                      beers={beers}
                      value={beerFor(id)}
                      onChange={(v) => setOverride(id, v)}
                      currencyCode={currencyCode}
                      locale={locale}
                      placeholder={t('defaultBeerHint')}
                      ariaLabel={t('overrideHint', { name: m.displayName })}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowOverrides(true)}
            className="text-muted-foreground self-start text-xs underline underline-offset-4"
          >
            {t('overrideToggle')}
          </button>
        )
      ) : null}

      <Button
        type="button"
        size="lg"
        disabled={!canLog}
        isPending={isPending}
        onClick={submit}
        className="h-12 text-base"
      >
        {t('submitCta', { count })}
      </Button>
    </div>
  );
}

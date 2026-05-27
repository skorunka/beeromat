'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { CircleUser } from 'lucide-react';

import { setAvatarAction } from '@/app/[locale]/(app)/account/actions';
import { AVATAR_KEYS, GLYPHS, type AvatarKey } from '@/lib/avatars/palette';
import { cn } from '@/lib/utils';

// Spec 020 — the avatar picker grid. Lives in /account. Tap a tile
// to set; tap the Default tile to clear back to initials. Saves
// immediately (no submit button); the visual update is the
// confirmation, so no success toast either. Failures fall back to
// a sonner toast.

interface AvatarPickerProps {
  currentKey: string | null;
}

export function AvatarPicker({ currentKey }: AvatarPickerProps) {
  const t = useTranslations('account.avatar');
  // Optimistic update — the tile we just tapped shows as selected
  // immediately, server response only matters for the error case.
  const [optimisticKey, setOptimisticKey] = useState<string | null>(currentKey);
  const [isPending, startTransition] = useTransition();

  function handlePick(nextKey: AvatarKey | null) {
    if (nextKey === optimisticKey || isPending) return;
    const previousKey = optimisticKey;
    setOptimisticKey(nextKey);
    startTransition(async () => {
      const result = await setAvatarAction({ avatarKey: nextKey });
      if (!result.ok) {
        // Roll back the optimistic update.
        setOptimisticKey(previousKey);
        toast.error(t('saveError'));
      }
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <header className="flex flex-col gap-0.5">
        <h2 className="text-sm font-medium">{t('sectionTitle')}</h2>
        <p className="text-muted-foreground text-xs">{t('sectionHint')}</p>
      </header>

      <div className="grid grid-cols-5 gap-3">
        {/* Default tile — clears back to initials/icon */}
        <PickerTile
          isSelected={optimisticKey === null}
          isPending={isPending}
          ariaLabel={t('defaultTileLabel')}
          onClick={() => handlePick(null)}
        >
          <CircleUser className="text-primary h-6 w-6" aria-hidden />
        </PickerTile>

        {AVATAR_KEYS.map((key) => {
          const glyph = GLYPHS[key];
          return (
            <PickerTile
              key={key}
              isSelected={optimisticKey === key}
              isPending={isPending}
              ariaLabel={key}
              onClick={() => handlePick(key)}
            >
              <svg
                viewBox={glyph.viewBox}
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden
                className="text-primary h-7 w-7"
              >
                {glyph.body}
              </svg>
            </PickerTile>
          );
        })}
      </div>
    </section>
  );
}

interface PickerTileProps {
  isSelected: boolean;
  isPending: boolean;
  ariaLabel: string;
  onClick: () => void;
  children: React.ReactNode;
}

function PickerTile({
  isSelected,
  isPending,
  ariaLabel,
  onClick,
  children,
}: PickerTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      aria-label={ariaLabel}
      aria-pressed={isSelected}
      className={cn(
        'bg-primary/15 hover:bg-primary/25 flex h-12 w-12 items-center justify-center rounded-full transition-all',
        // The picked tile gets a ring + a tiny "pop" animation when
        // it becomes selected. animate-avatar-pop is defined in
        // globals.css and gated by prefers-reduced-motion.
        isSelected && 'ring-primary ring-2 ring-offset-2 ring-offset-background animate-avatar-pop',
        isPending && 'opacity-60',
      )}
    >
      {children}
    </button>
  );
}

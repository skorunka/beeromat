'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CircleUser, Upload } from 'lucide-react';

import {
  setAvatarAction,
  removeAvatarUploadAction,
} from '@/app/[locale]/(app)/account/actions';
import { AvatarUploadForm } from '@/components/account/avatar-upload-form';
import { AVATAR_KEYS, GLYPHS, type AvatarKey } from '@/lib/avatars/palette';
import { cn } from '@/lib/utils';

// Spec 020 + spec 021 — the avatar picker grid. Lives in /account.
//   • Tap any glyph or the Default tile → setAvatarAction.
//   • Tap the Upload tile → expands the AvatarUploadForm inline.
// Picking a glyph or Default also drops any existing upload (the
// server action handles the dual-clear in one transaction).

interface AvatarPickerProps {
  /** Current spec-020 glyph key (null if none picked). */
  currentKey: string | null;
  /** Pre-computed URL of the member's uploaded avatar, or null. */
  uploadUrl: string | null;
}

export function AvatarPicker({ currentKey, uploadUrl }: AvatarPickerProps) {
  const t = useTranslations('account.avatar');
  const tUpload = useTranslations('account.avatar.upload');
  const router = useRouter();

  // Optimistic state for the glyph selection. The upload state is
  // not optimistic — it's driven entirely by the server response
  // (the bytes have to be processed before the URL is valid).
  const [optimisticKey, setOptimisticKey] = useState<string | null>(currentKey);
  const [isPending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);

  const hasUpload = uploadUrl !== null;

  function handlePick(nextKey: AvatarKey | null) {
    // No-op only when there's no upload either (otherwise picking
    // any glyph also removes the upload — meaningful action).
    if (nextKey === optimisticKey && !hasUpload) return;
    if (isPending) return;
    const previousKey = optimisticKey;
    setOptimisticKey(nextKey);
    startTransition(async () => {
      const result = await setAvatarAction({ avatarKey: nextKey });
      if (!result.ok) {
        setOptimisticKey(previousKey);
        toast.error(t('saveError'));
        return;
      }
      // The server action revalidates the layout; force a refresh
      // so the parent re-fetches uploadUrl (now null) and re-renders
      // the picker with the new state.
      router.refresh();
    });
  }

  function handleRemoveUpload() {
    if (isPending) return;
    startTransition(async () => {
      const result = await removeAvatarUploadAction();
      if (!result.ok) {
        toast.error(tUpload('errorGeneric'));
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <header className="flex flex-col gap-0.5">
        <h2 className="text-sm font-medium">{t('sectionTitle')}</h2>
        <p className="text-muted-foreground text-xs">{t('sectionHint')}</p>
      </header>

      <div className="grid grid-cols-5 gap-3">
        {/* Default tile — clears back to initials/icon (also drops
            any upload via the server action). */}
        <PickerTile
          isSelected={optimisticKey === null && !hasUpload}
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
              isSelected={optimisticKey === key && !hasUpload}
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

        {/* Upload tile — when no upload yet, shows the Upload icon.
            When an upload exists, shows the uploaded image as the
            tile content + ring to mark it as the current selection. */}
        <PickerTile
          isSelected={hasUpload}
          isPending={isPending}
          ariaLabel={tUpload('uploadTileLabel')}
          onClick={() => setUploading(true)}
        >
          {hasUpload && uploadUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={uploadUrl} alt="" className="h-full w-full rounded-full object-cover" />
          ) : (
            <Upload className="text-primary h-6 w-6" aria-hidden />
          )}
        </PickerTile>
      </div>

      {/* Remove-upload affordance, visible only when an upload is
          the current selection. The Default tile / glyph picks
          ALSO remove the upload via the server action, but a direct
          "Remove uploaded" button is the most discoverable path. */}
      {hasUpload ? (
        <button
          type="button"
          onClick={handleRemoveUpload}
          disabled={isPending}
          className="text-muted-foreground hover:text-foreground self-start text-xs underline"
        >
          {tUpload('removeCta')}
        </button>
      ) : null}

      {/* Upload form expansion — collapsed by default, opens on
          Upload tile tap. Closes on success or cancel. */}
      {uploading ? (
        <div className="border-border rounded-lg border p-3">
          <AvatarUploadForm
            onSuccess={() => {
              setUploading(false);
              router.refresh();
            }}
            onCancel={() => setUploading(false)}
          />
        </div>
      ) : null}
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
        'bg-primary/15 hover:bg-primary/25 flex h-12 w-12 items-center justify-center overflow-hidden rounded-full transition-all',
        isSelected && 'ring-primary ring-2 ring-offset-2 ring-offset-background animate-avatar-pop',
        isPending && 'opacity-60',
      )}
    >
      {children}
    </button>
  );
}

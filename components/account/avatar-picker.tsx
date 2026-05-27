'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CircleUser, Trash2, Upload } from 'lucide-react';

import {
  activateAvatarUploadAction,
  removeAvatarUploadAction,
  setAvatarAction,
} from '@/app/[locale]/(app)/account/actions';
import { AvatarUploadForm } from '@/components/account/avatar-upload-form';
import { Button } from '@/components/ui/button';
import { AVATAR_KEYS, GLYPHS, type AvatarKey } from '@/lib/avatars/palette';
import { cn } from '@/lib/utils';

// Spec 020 + spec 021 — the avatar picker grid. Lives in /account.
// Two upload states the picker distinguishes:
//   • activeUploadUrl: non-null iff the upload is what the renderer
//     is currently showing (members.avatar_upload_at is non-null).
//   • storedUploadUrl: non-null iff avatar_uploads has bytes for
//     this member at all — active OR deactivated by picking a glyph.
//
// Picking a glyph DEACTIVATES the upload (clears avatar_upload_at)
// but DOES NOT delete the bytes — so the member can tap the Upload
// tile to reactivate their previously-uploaded photo. The "Remove
// photo" button is the only path that actually drops the bytes.

interface AvatarPickerProps {
  /** Current spec-020 glyph key (null if none picked). */
  currentKey: string | null;
  /** URL of the uploaded photo iff the renderer is currently using it. */
  activeUploadUrl: string | null;
  /** URL of the stored upload bytes — non-null iff bytes exist,
   *  whether they're the active renderer choice or not. */
  storedUploadUrl: string | null;
}

export function AvatarPicker({
  currentKey,
  activeUploadUrl,
  storedUploadUrl,
}: AvatarPickerProps) {
  const t = useTranslations('account.avatar');
  const tUpload = useTranslations('account.avatar.upload');
  const router = useRouter();

  const [optimisticKey, setOptimisticKey] = useState<string | null>(currentKey);
  const [isPending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);

  const uploadIsActive = activeUploadUrl !== null;
  const hasStoredBytes = storedUploadUrl !== null;

  function handlePickGlyph(nextKey: AvatarKey | null) {
    if (nextKey === optimisticKey && !uploadIsActive) return;
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
      router.refresh();
    });
  }

  function handleUploadTileTap() {
    if (isPending) return;
    if (hasStoredBytes && !uploadIsActive) {
      // Stored bytes exist but a glyph is currently active —
      // reactivate the upload without re-uploading. Single tap
      // restores the previously-uploaded photo.
      startTransition(async () => {
        const result = await activateAvatarUploadAction();
        if (!result.ok) {
          toast.error(tUpload('errorGeneric'));
          return;
        }
        router.refresh();
      });
      return;
    }
    // Active OR empty → open the form. Active means the member
    // wants to re-upload / re-crop; empty means first upload.
    setUploading(true);
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
        {/* Default tile — clears back to initials/icon. Deactivates
            any upload but keeps the bytes. */}
        <PickerTile
          isSelected={optimisticKey === null && !uploadIsActive}
          isPending={isPending}
          ariaLabel={t('defaultTileLabel')}
          onClick={() => handlePickGlyph(null)}
        >
          <CircleUser className="text-primary h-6 w-6" aria-hidden />
        </PickerTile>

        {AVATAR_KEYS.map((key) => {
          const glyph = GLYPHS[key];
          return (
            <PickerTile
              key={key}
              isSelected={optimisticKey === key && !uploadIsActive}
              isPending={isPending}
              ariaLabel={key}
              onClick={() => handlePickGlyph(key)}
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

        {/* Upload tile — three visual states:
              • Stored bytes + active → image + selection ring
              • Stored bytes + not active → image, no ring (tap to
                reactivate)
              • No stored bytes → dashed-border Upload icon */}
        <UploadTile
          uploadIsActive={uploadIsActive}
          storedUploadUrl={storedUploadUrl}
          isPending={isPending}
          ariaLabel={tUpload('uploadTileLabel')}
          onClick={handleUploadTileTap}
        />
      </div>

      {/* Remove-photo button — the only path that deletes stored
          bytes. Tapping the Upload tile handles upload, re-upload,
          and reactivation; no separate "Change photo" button. */}
      {hasStoredBytes ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleRemoveUpload}
          disabled={isPending}
          isPending={isPending}
          className="self-start"
        >
          <Trash2 aria-hidden />
          {tUpload('removeCta')}
        </Button>
      ) : null}

      {/* Upload form expansion — collapsed by default. */}
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

interface UploadTileProps {
  uploadIsActive: boolean;
  storedUploadUrl: string | null;
  isPending: boolean;
  ariaLabel: string;
  onClick: () => void;
}

function UploadTile({
  uploadIsActive,
  storedUploadUrl,
  isPending,
  ariaLabel,
  onClick,
}: UploadTileProps) {
  // Stored bytes exist (active or not) → show the image. The ring
  // is only on the active state.
  if (storedUploadUrl) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        aria-label={ariaLabel}
        aria-pressed={uploadIsActive}
        className={cn(
          'bg-primary/15 hover:bg-primary/25 flex h-12 w-12 items-center justify-center overflow-hidden rounded-full transition-all',
          uploadIsActive &&
            'ring-primary animate-avatar-pop ring-2 ring-offset-2 ring-offset-background',
          isPending && 'opacity-60',
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={storedUploadUrl} alt="" className="h-full w-full rounded-full object-cover" />
      </button>
    );
  }
  // No stored bytes — dashed-border empty state, reads as an action.
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      aria-label={ariaLabel}
      className={cn(
        'border-primary/50 text-primary hover:bg-primary/10 hover:border-primary flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed bg-transparent transition-all',
        isPending && 'opacity-60',
      )}
    >
      <Upload className="h-5 w-5" aria-hidden />
    </button>
  );
}

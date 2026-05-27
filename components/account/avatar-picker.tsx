'use client';

import { useRef, useState, useTransition } from 'react';
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
import {
  AVATAR_ALLOWED_CONTENT_TYPES,
} from '@/lib/avatars/upload-validate';
import { cn } from '@/lib/utils';

// Spec 020 + spec 021 — the avatar picker grid. Lives in /account.
//
// The Upload tile owns the file picker directly: tapping it opens
// the OS file dialog (when no stored bytes exist OR when the upload
// is currently the active renderer choice) and the crop UI appears
// as soon as a file lands. When stored bytes exist but a glyph is
// currently active, tapping the Upload tile REACTIVATES the stored
// photo instead — no re-upload needed.
//
// Stored bytes survive a glyph pick (the renderer just stops using
// them); only the explicit "Remove photo" trash button drops them.

interface AvatarPickerProps {
  /** Current spec-020 glyph key (null if none picked). */
  currentKey: string | null;
  /** URL of the uploaded photo iff the renderer is currently using it. */
  activeUploadUrl: string | null;
  /** URL of the stored upload bytes — non-null iff bytes exist,
   *  whether they're the active renderer choice or not. */
  storedUploadUrl: string | null;
}

const ALLOWED_ACCEPT = AVATAR_ALLOWED_CONTENT_TYPES.join(',');

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
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
    // Empty OR already-active — open the OS file picker. Active
    // means the member wants to re-crop / re-upload.
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file later
    if (!file) return;
    if (!(AVATAR_ALLOWED_CONTENT_TYPES as readonly string[]).includes(file.type)) {
      toast.error(tUpload('errorInvalidType'));
      return;
    }
    setPickedFile(file);
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
      {/* Section header: title on the left, Remove-photo button
          top-right (when stored bytes exist). Top-right placement
          saves a row vs the previous below-grid position. */}
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">{t('sectionTitle')}</h2>
        {hasStoredBytes ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRemoveUpload}
            disabled={isPending}
            isPending={isPending}
          >
            <Trash2 aria-hidden />
            {tUpload('removeCta')}
          </Button>
        ) : null}
      </header>

      {/* Hidden file input owned by the picker. The Upload tile
          programmatically clicks it; the file change handler opens
          the crop UI by setting pickedFile. */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_ACCEPT}
        onChange={handleFileChange}
        className="hidden"
      />

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
                reactivate without re-uploading)
              • No stored bytes → dashed-border Upload icon (tap to
                open file picker) */}
        <UploadTile
          uploadIsActive={uploadIsActive}
          storedUploadUrl={storedUploadUrl}
          isPending={isPending}
          ariaLabel={tUpload('uploadTileLabel')}
          onClick={handleUploadTileTap}
        />
      </div>

      {/* Crop UI appears as soon as a file is picked. The form
          handles read → crop → resize → upload internally. */}
      {pickedFile ? (
        <div className="border-border rounded-lg border p-3">
          <AvatarUploadForm
            file={pickedFile}
            onSuccess={() => {
              setPickedFile(null);
              router.refresh();
            }}
            onCancel={() => setPickedFile(null)}
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

'use client';

import { useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import ReactCrop, {
  centerCrop,
  makeAspectCrop,
  type Crop,
  type PixelCrop,
} from 'react-image-crop';
import imageCompression from 'browser-image-compression';

import 'react-image-crop/dist/ReactCrop.css';

import { uploadAvatarAction } from '@/app/[locale]/(app)/account/actions';
import { Button } from '@/components/ui/button';
import { AVATAR_ALLOWED_CONTENT_TYPES } from '@/lib/avatars/upload-validate';

// Spec 021 — file picker + circular-mask crop UI + client-side
// resize/compress + post to uploadAvatarAction.
//
// Flow: idle → file-picked → cropping → saving → done | error.
// Compression target: 512×512 JPEG q0.85 produces ~50–150 KB for
// any reasonable source photo. The fileType: 'image/jpeg' option
// also strips animation from animated GIF/WebP inputs as a
// side-effect of the canvas re-encode (FR-011).

interface AvatarUploadFormProps {
  /** Called when the upload succeeds; lets the parent close itself. */
  onSuccess?: () => void;
  /** Called when the user cancels without uploading. */
  onCancel?: () => void;
}

const ALLOWED_ACCEPT = AVATAR_ALLOWED_CONTENT_TYPES.join(',');

export function AvatarUploadForm({ onSuccess, onCancel }: AvatarUploadFormProps) {
  const t = useTranslations('account.avatar.upload');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop | undefined>(undefined);
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const [isPending, startTransition] = useTransition();

  function pickFile() {
    fileInputRef.current?.click();
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Client-side type guard (the input accept already filters at the
    // OS picker, but a sneaky file can slip through on some platforms).
    if (!(AVATAR_ALLOWED_CONTENT_TYPES as readonly string[]).includes(file.type)) {
      toast.error(t('errorInvalidType'));
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImageSrc(reader.result as string);
    reader.readAsDataURL(file);
  }

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    // Default crop: centered square at 90% of the smaller dimension.
    const { width, height } = e.currentTarget;
    setCrop(
      centerCrop(makeAspectCrop({ unit: '%', width: 90 }, 1, width, height), width, height),
    );
  }

  async function handleSave() {
    if (!imgRef.current || !completedCrop || completedCrop.width === 0) {
      return;
    }
    startTransition(async () => {
      try {
        const croppedBlob = await cropToBlob(imgRef.current!, completedCrop);
        const compressedFile = await imageCompression(
          new File([croppedBlob], 'avatar.jpg', { type: 'image/jpeg' }),
          {
            maxWidthOrHeight: 512,
            maxSizeMB: 0.2,
            useWebWorker: true,
            fileType: 'image/jpeg',
          },
        );
        const buffer = await compressedFile.arrayBuffer();
        const base64 = bufferToBase64(buffer);
        const result = await uploadAvatarAction({
          imageBase64: base64,
          contentType: 'image/jpeg',
        });
        if (!result.ok) {
          if (result.code === 'OVERSIZE') toast.error(t('errorOversize'));
          else if (result.code === 'INVALID_CONTENT_TYPE') toast.error(t('errorInvalidType'));
          else toast.error(t('errorGeneric'));
          return;
        }
        onSuccess?.();
      } catch {
        toast.error(t('errorGeneric'));
      }
    });
  }

  function handleCancel() {
    setImageSrc(null);
    setCompletedCrop(null);
    onCancel?.();
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_ACCEPT}
        onChange={handleFile}
        className="hidden"
      />

      {!imageSrc ? (
        <Button type="button" variant="outline" onClick={pickFile} disabled={isPending}>
          {t('uploadTileLabel')}
        </Button>
      ) : (
        <>
          <div>
            <h3 className="text-sm font-medium">{t('cropTitle')}</h3>
            <p className="text-muted-foreground mt-0.5 text-xs">{t('cropSubtitle')}</p>
          </div>
          <div className="bg-muted overflow-hidden rounded-lg p-2">
            <ReactCrop
              crop={crop}
              onChange={(c) => setCrop(c)}
              onComplete={(c) => setCompletedCrop(c)}
              aspect={1}
              circularCrop
              keepSelection
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgRef}
                src={imageSrc}
                alt=""
                onLoad={onImageLoad}
                className="block max-h-[60vh] w-full object-contain"
              />
            </ReactCrop>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={handleSave}
              disabled={isPending || !completedCrop || completedCrop.width === 0}
              isPending={isPending}
              className="flex-1"
            >
              {t('saveCta')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={handleCancel}
              disabled={isPending}
            >
              {t('cancelCta')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// Draw the cropped region of the loaded image element onto a canvas
// and return it as a JPEG blob. Source dimensions for the crop
// come from the natural image; what the user sees is a scaled preview.
async function cropToBlob(image: HTMLImageElement, crop: PixelCrop): Promise<Blob> {
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  const canvas = document.createElement('canvas');
  canvas.width = crop.width * scaleX;
  canvas.height = crop.height * scaleY;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas context unavailable');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    crop.width * scaleX,
    crop.height * scaleY,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob returned null'))),
      'image/jpeg',
      0.95,
    );
  });
}

function bufferToBase64(buffer: ArrayBuffer): string {
  // Browser-safe base64 encoding. btoa() requires a binary string;
  // build it char-by-char from the buffer.
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

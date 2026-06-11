'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download, Share, X } from 'lucide-react';

import { usePwaInstall } from '@/components/pwa/install-provider';

// Auto install banner. Install capability comes from PwaInstallProvider
// (shared with the user-menu "Install app" row); this component owns the
// presentation + the "don't nag" dismissal:
//   • Chromium: show as soon as the prompt is available.
//   • iOS Safari: no event — reveal the manual Share hint after a beat.
//   • Suppressed for DISMISS_DAYS after a dismissal / declined prompt,
//     and never shown once installed (provider gates canInstall/isIos).

const DISMISS_KEY = 'beeromat-install-dismissed';
const DISMISS_MS = 14 * 24 * 60 * 60 * 1000;

function dismissedRecently(): boolean {
  try {
    const ts = Number(localStorage.getItem(DISMISS_KEY));
    return Number.isFinite(ts) && ts > 0 && Date.now() - ts < DISMISS_MS;
  } catch {
    return false;
  }
}

function rememberDismissal(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* storage blocked (private mode) — we just can't remember */
  }
}

export function InstallPrompt() {
  const t = useTranslations('pwa.install');
  const { canInstall, isIos, promptInstall } = usePwaInstall();
  const [dismissed, setDismissed] = useState(true); // hidden until checked
  const [iosReady, setIosReady] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    setDismissed(dismissedRecently());
  }, []);

  // iOS has no beforeinstallprompt — reveal the manual hint after a beat
  // so it doesn't slam in on first paint.
  useEffect(() => {
    if (!isIos) return;
    const id = setTimeout(() => setIosReady(true), 3000);
    return () => clearTimeout(id);
  }, [isIos]);

  const mode: 'prompt' | 'ios' | 'none' = dismissed
    ? 'none'
    : canInstall
      ? 'prompt'
      : isIos && iosReady
        ? 'ios'
        : 'none';

  useEffect(() => {
    if (mode === 'none') {
      setShown(false);
      return;
    }
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [mode]);

  function close() {
    rememberDismissal();
    setDismissed(true);
    setShown(false);
  }

  async function install() {
    const outcome = await promptInstall();
    if (outcome === 'dismissed') {
      rememberDismissal();
      setDismissed(true);
    }
    setShown(false);
  }

  if (mode === 'none') return null;

  return (
    <div
      role="region"
      aria-label={t(mode === 'ios' ? 'iosTitle' : 'title')}
      className={`border-border bg-card fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-2xl border p-4 shadow-lg transition-all duration-200 ${
        shown ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      }`}
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
    >
      <button
        type="button"
        onClick={close}
        aria-label={t('dismiss')}
        className="text-muted-foreground hover:text-foreground absolute top-2 right-2 flex size-8 items-center justify-center rounded-md"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>

      <div className="flex items-start gap-3 pr-6">
        <span
          aria-hidden
          className="bg-primary/10 flex size-11 shrink-0 items-center justify-center rounded-xl text-2xl"
        >
          🍺
        </span>
        <div className="min-w-0 flex-1">
          {mode === 'prompt' ? (
            <>
              <p className="font-semibold">{t('title')}</p>
              <p className="text-muted-foreground mt-0.5 text-sm">{t('subtitle')}</p>
              <button
                type="button"
                onClick={install}
                className="bg-primary text-primary-foreground hover:bg-primary/90 mt-3 inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold"
              >
                <Download className="h-4 w-4" aria-hidden />
                {t('cta')}
              </button>
            </>
          ) : (
            <>
              <p className="font-semibold">{t('iosTitle')}</p>
              <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-sm">
                <Share className="h-4 w-4 shrink-0" aria-hidden />
                <span>{t('iosBody')}</span>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

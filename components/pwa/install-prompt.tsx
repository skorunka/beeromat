'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download, Share, X } from 'lucide-react';

// In-app PWA install banner. Best-practice flow (per web.dev / MDN):
//   • Chromium (Android + desktop): capture beforeinstallprompt,
//     preventDefault, stash it, and show our own UI. The native prompt
//     fires only on a user gesture (the Install button), and the
//     stashed event is single-use.
//   • iOS Safari: there is no beforeinstallprompt — show manual
//     "Share → Add to Home Screen" instructions instead. (Chrome/Edge
//     on iOS can't install PWAs, so we only hint in Safari.)
//   • Never nag: hidden once installed (display-mode: standalone),
//     cleared on `appinstalled`, and suppressed for DISMISS_DAYS after
//     a dismissal / a declined native prompt.
//
// Renders nothing until installable. No NODE_ENV gate needed: in dev
// the service worker isn't registered (registrar is prod-only), so the
// install criteria aren't met and beforeinstallprompt never fires; the
// iOS branch only triggers on a real iOS Safari UA.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'beeromat-install-dismissed';
const DISMISS_DAYS = 14;
const DISMISS_MS = DISMISS_DAYS * 24 * 60 * 60 * 1000;

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
    /* private mode / storage blocked — fine, we just can't remember */
  }
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function InstallPrompt() {
  const t = useTranslations('pwa.install');
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [mode, setMode] = useState<'none' | 'prompt' | 'ios'>('none');
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (isStandalone() || dismissedRecently()) return;

    const ua = window.navigator.userAgent;
    const isIosSafari =
      /iphone|ipad|ipod/i.test(ua) && !/crios|fxios|edgios/i.test(ua);

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault(); // stop Chrome's mini-infobar; we drive the UI
      setDeferred(e as BeforeInstallPromptEvent);
      setMode('prompt');
    };
    const onInstalled = () => {
      try {
        localStorage.removeItem(DISMISS_KEY);
      } catch {
        /* ignore */
      }
      setDeferred(null);
      setMode('none');
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);

    // iOS can't fire beforeinstallprompt — surface the manual hint after
    // a short beat so it doesn't slam in on first paint.
    let iosTimer: ReturnType<typeof setTimeout> | undefined;
    if (isIosSafari) {
      iosTimer = setTimeout(() => setMode((m) => (m === 'none' ? 'ios' : m)), 3000);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      if (iosTimer) clearTimeout(iosTimer);
    };
  }, []);

  // Drive the slide-in once a banner becomes visible.
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
    setShown(false);
    setTimeout(() => setMode('none'), 200);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    // The event is spent either way. On "accepted", `appinstalled` also
    // fires and clears state; on "dismissed", suppress for the window.
    if (outcome === 'dismissed') rememberDismissal();
    setDeferred(null);
    setShown(false);
    setTimeout(() => setMode('none'), 200);
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

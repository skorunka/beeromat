'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

// Single source of truth for PWA install state. The `beforeinstallprompt`
// event is single-use, so capturing it in one place (here) and sharing
// it via context lets BOTH the auto banner (install-prompt.tsx) and the
// user-menu "Install app" row drive the same native prompt without
// fighting over a spent event.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

interface PwaInstallValue {
  /** Chromium (Android/desktop) fired beforeinstallprompt — we can show
   *  the native prompt right now. */
  canInstall: boolean;
  /** iOS Safari (no beforeinstallprompt) and not already installed —
   *  callers should show the manual Share→Add-to-Home-Screen hint. */
  isIos: boolean;
  /** Already running as an installed app. */
  isStandalone: boolean;
  /** Fire the native install prompt. Returns 'unavailable' if there's no
   *  captured event (iOS, or the event hasn't fired yet). */
  promptInstall: () => Promise<InstallOutcome>;
}

const PwaInstallContext = createContext<PwaInstallValue>({
  canInstall: false,
  isIos: false,
  isStandalone: false,
  promptInstall: async () => 'unavailable',
});

export function usePwaInstall(): PwaInstallValue {
  return useContext(PwaInstallContext);
}

export function PwaInstallProvider({ children }: { children: React.ReactNode }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIosSafari, setIsIosSafari] = useState(false);

  useEffect(() => {
    // Client-only detection after mount (window APIs); setState here is the
    // correct pattern for post-hydration values.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsStandalone(
      window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true,
    );
    const ua = window.navigator.userAgent;
    setIsIosSafari(/iphone|ipad|ipod/i.test(ua) && !/crios|fxios|edgios/i.test(ua));

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault(); // suppress Chrome's mini-infobar; we drive the UI
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setIsStandalone(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<InstallOutcome> => {
    if (!deferred) return 'unavailable';
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null); // the event is single-use
    return outcome;
  }, [deferred]);

  return (
    <PwaInstallContext.Provider
      value={{
        canInstall: !!deferred && !isStandalone,
        isIos: isIosSafari && !isStandalone,
        isStandalone,
        promptInstall,
      }}
    >
      {children}
    </PwaInstallContext.Provider>
  );
}

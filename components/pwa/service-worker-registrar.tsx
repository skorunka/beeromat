'use client';

import { useEffect } from 'react';

// Registers the PWA service worker (public/sw.js) after the page loads.
//
// Production-only on purpose: in dev, Turbopack serves freshly-built
// chunks on every change, and a cache-first service worker would fight
// HMR (stale chunks, ghost errors). To exercise it locally, run a prod
// build (`next build && next start`). On Vercel it registers normally.
//
// Renders nothing — it's a mount-time side effect only.
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        // Non-fatal: the app works without the SW, just not installable
        // / offline-capable. Log so a failure is diagnosable.
        console.error('[pwa] service worker registration failed', err);
      });
    };

    // Wait for load so SW registration never competes with the initial
    // render for bandwidth.
    if (document.readyState === 'complete') {
      register();
    } else {
      window.addEventListener('load', register, { once: true });
      return () => window.removeEventListener('load', register);
    }
  }, []);

  return null;
}

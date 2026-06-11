// beeromat service worker — installable PWA + graceful offline.
//
// Deliberately minimal and hand-rolled (no Workbox/Serwist build
// integration) so it stays compatible with Next 16 + Turbopack and
// carries no dependency. Strategy:
//
//   • install   → precache the offline fallback + icons, then take over
//                  immediately (skipWaiting).
//   • activate  → drop caches from older versions, claim open clients.
//   • fetch     → GET only:
//       - navigations  : network-first; on failure serve /offline.html.
//       - static assets: cache-first (Next /_next/static is immutable,
//                         content-hashed — safe to cache forever).
//       - everything else (API, dynamic data): NOT intercepted — it
//                         goes straight to the network, so we never
//                         serve stale balances/tabs or interfere with
//                         auth. Offline simply fails as it would today.
//
// Bump CACHE_VERSION to invalidate the precache + asset cache on deploy.

const CACHE_VERSION = 'beeromat-v1';
const PRECACHE = `${CACHE_VERSION}-precache`;
const RUNTIME = `${CACHE_VERSION}-runtime`;

const OFFLINE_URL = '/offline.html';
const PRECACHE_URLS = [OFFLINE_URL, '/icon', '/icon-512', '/icon-maskable', '/apple-icon'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PRECACHE);
      // addAll is atomic — if any precache URL 404s the whole install
      // fails, so keep this list to assets we know exist.
      await cache.addAll(PRECACHE_URLS);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== PRECACHE && k !== RUNTIME)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icon') ||
    url.pathname === '/apple-icon' ||
    url.pathname === '/manifest.webmanifest'
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Only same-origin; let cross-origin (Turnstile, analytics, …) pass
  // through untouched.
  if (url.origin !== self.location.origin) return;

  // Navigations → network-first, offline fallback on failure.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cache = await caches.open(PRECACHE);
          const offline = await cache.match(OFFLINE_URL);
          return offline ?? Response.error();
        }
      })(),
    );
    return;
  }

  // Immutable static assets → cache-first, populate on first hit.
  if (isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        try {
          const res = await fetch(request);
          if (res.ok) {
            const cache = await caches.open(RUNTIME);
            cache.put(request, res.clone());
          }
          return res;
        } catch {
          return Response.error();
        }
      })(),
    );
    return;
  }

  // Everything else (API, dynamic pages' data): network-only.
  // Not intercepted → default browser behaviour.
});

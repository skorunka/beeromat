import type { MetadataRoute } from 'next';

// Web App Manifest — installable PWA per constitution Principle I.
// The service worker (public/sw.js, registered by
// components/pwa/service-worker-registrar.tsx) adds reliable install
// prompts + an offline fallback.
//
// Icons are generated dynamically: app/icon.tsx (192, any),
// app/icon-512 (512, any), app/icon-maskable (512, maskable — padded
// safe zone), app/apple-icon.tsx (180, iOS). URLs are stable routes.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'beeromat',
    short_name: 'beeromat',
    description: 'After-match beer tab tracker for tennis clubs',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    theme_color: '#b5701a',
    background_color: '#f6eedd',
    lang: 'cs',
    icons: [
      { src: '/icon', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}

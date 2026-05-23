import type { MetadataRoute } from 'next';

// Web App Manifest — installable PWA per constitution Principle I.
// No service worker in v1; offline mode is a v1+ enhancement.
//
// Icons are generated dynamically by app/icon.tsx (192px) and
// app/apple-icon.tsx (180px). Their URLs come from Next.js's automatic
// file-based routing.
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
      {
        src: '/icon',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/apple-icon',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  };
}

import { ImageResponse } from 'next/og';

// 512×512 PWA icon (purpose "any") for the manifest — splash screens
// and high-DPI home-screen icons. Same amber + beer-mug treatment as
// the 192 /icon, scaled up. Stable URL `/icon-512` (a plain route
// handler, not the metadata-file convention, so the manifest can
// reference it directly). The path starts with "icon", so proxy.ts's
// matcher excludes it from the locale middleware.
export const dynamic = 'force-static';

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#b5701a',
          fontSize: 380,
          borderRadius: 86,
        }}
      >
        🍺
      </div>
    ),
    { width: 512, height: 512 },
  );
}

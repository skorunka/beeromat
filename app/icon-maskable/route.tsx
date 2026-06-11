import { ImageResponse } from 'next/og';

// 512×512 MASKABLE PWA icon. Android masks icons to arbitrary shapes
// (circle, squircle, …), clipping anything outside the inner ~80%
// "safe zone". So: full-bleed amber background (no border radius — the
// OS supplies the shape) and a smaller, centered mug well inside the
// safe zone, instead of reusing the edge-to-edge /icon (which would get
// its corners/edges shaved). Referenced from the manifest with
// purpose "maskable". Stable URL `/icon-maskable`.
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
          // ~58% of 512 → comfortably inside the 80% maskable safe zone.
          fontSize: 300,
        }}
      >
        🍺
      </div>
    ),
    { width: 512, height: 512 },
  );
}

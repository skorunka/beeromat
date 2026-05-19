import { ImageResponse } from 'next/og';

// Next.js file-based icon convention — the route handler at /icon
// returns a 192×192 PNG suitable for the PWA manifest and as a generic
// favicon for browsers that don't pick up favicon.ico.
//
// v1 placeholder: amber background with a beer-mug emoji. Replace with
// a designed icon before public launch (T038 placeholder note).

export const size = { width: 192, height: 192 } as const;
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f59e0b',
          fontSize: 140,
          borderRadius: 32,
        }}
      >
        🍺
      </div>
    ),
    { ...size },
  );
}

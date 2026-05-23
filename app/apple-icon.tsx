import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 } as const;
export const contentType = 'image/png';

export default function AppleIcon() {
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
          fontSize: 132,
        }}
      >
        🍺
      </div>
    ),
    { ...size },
  );
}

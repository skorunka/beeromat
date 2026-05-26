'use client';

import { useEffect, useState } from 'react';

// Global "you logged a beer!" celebration overlay. Mounted once in
// the locale layout, listens on window for the 'beer-logged'
// CustomEvent (dispatched via lib/celebrate.ts from every log success
// path). Each event fires a fresh instance — the central 🍻 pops in
// big + a fan of 🍺 mugs fountains outward like fireworks. Auto-
// cleans after ~1.3s. Stacking multiple rapid logs is fine: each
// instance has its own id so React keeps them distinct.
//
// pointer-events-none so the overlay never blocks the underlying UI.
// motion-reduce:hidden so users who've requested reduced motion get
// nothing — the toast already confirms the action verbally.
//
// Animation lives in app/globals.css (animate-beer-cheers-pop +
// animate-beer-mug-fountain) so the reduced-motion media query can
// disable it in one place.

interface Celebration {
  id: number;
}

export function BeerCelebration() {
  const [active, setActive] = useState<Celebration[]>([]);

  useEffect(() => {
    let counter = 0;
    function onLogged() {
      counter += 1;
      const id = counter;
      setActive((prev) => [...prev, { id }]);
      window.setTimeout(() => {
        setActive((prev) => prev.filter((c) => c.id !== id));
      }, 1300);
    }
    window.addEventListener('beer-logged', onLogged);
    return () => window.removeEventListener('beer-logged', onLogged);
  }, []);

  if (active.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center motion-reduce:hidden">
      {active.map((c) => (
        <CelebrationInstance key={c.id} />
      ))}
    </div>
  );
}

// Eight fountain particles fanning across a roughly 90° upward
// spread (-45° to +45°). Symmetric so the fountain reads as
// balanced. The --dx / --rot CSS vars feed the keyframe; see
// app/globals.css for the arc curve.
const PARTICLES = [
  { dx: -180, rot: -55 },
  { dx: -130, rot: -38 },
  { dx: -75, rot: -20 },
  { dx: -25, rot: -8 },
  { dx: 25, rot: 8 },
  { dx: 75, rot: 20 },
  { dx: 130, rot: 38 },
  { dx: 180, rot: 55 },
];

function CelebrationInstance() {
  return (
    <div className="relative">
      <span
        aria-hidden
        className="animate-beer-cheers-pop absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-7xl select-none"
      >
        🍻
      </span>
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          aria-hidden
          className="animate-beer-mug-fountain absolute top-1/2 left-1/2 text-4xl select-none"
          style={
            {
              '--dx': `${p.dx}px`,
              '--rot': `${p.rot * 4}deg`,
            } as React.CSSProperties
          }
        >
          🍺
        </span>
      ))}
    </div>
  );
}

// Tiny dispatcher for the global "beer logged" celebration overlay.
// Each successful beer log (one-tap, /log grid, /log/for) calls this;
// <BeerCelebration /> in the locale layout listens and renders the
// 🍻 + 🍺-fountain animation. Safe to import from server components —
// the no-op early return covers SSR.

export function celebrateBeer() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('beer-logged'));
}

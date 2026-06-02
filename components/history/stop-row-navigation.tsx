'use client';

import type { ReactNode } from 'react';

// Tiny utility wrapper used on /history list rows where the row
// itself is a clickable Link to the detail page, but a subtree
// (e.g. SessionTitleInlineEdit's button + input) needs to handle
// its own clicks WITHOUT bubbling up and triggering navigation.
//
// We also stop keydown propagation so Enter/Esc inside the
// inline-edit input never reaches a Link handler. Mousedown is
// stopped so the row's :active visual doesn't flash on edit.
//
// preventDefault on click is essential: the subtree lives inside an
// <a> (the row Link). stopPropagation only blocks React's Link
// onClick — the anchor's NATIVE navigation still fires from a click
// on a nested <button>, sending you to the detail page instead of
// editing in place. preventDefault cancels that default navigation.
//
// Server-safe? No — onClick on a div is a client-only handler,
// hence the 'use client' boundary.

export function StopRowNavigation({ children }: { children: ReactNode }) {
  return (
    <div
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

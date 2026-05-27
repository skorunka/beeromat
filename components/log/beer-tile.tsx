'use client';

import { cn } from '@/lib/utils';

// Spec 026 — shared h-16 beer-tile primitive used by:
//   - /log/for on-behalf form (beer side)
//   - match-result form bet-beer picker (non-Auto tiles)
//
// /log's beer-grid uses a richer h-32 BeerCard with low-stock
// badges + stock count and is intentionally NOT extracted
// through this component — see specs/026-polish-round-a-e/
// spec.md "Scope corrections" for the rationale.
//
// This component is a thin styled <button> wrapper. It does NOT
// carry any async state or action wiring — consumers own that
// (transitions, error toasts, post-submit navigation).

interface BeerTileBeer {
  id: string;
  name: string;
}

interface BeerTileProps {
  beer: BeerTileBeer;
  selected: boolean;
  onClick: () => void;
  /** Optional disabled state — e.g. zero-stock beer in the
   *  catalog. The button becomes inert + visually dimmed. */
  disabled?: boolean;
  className?: string;
}

export function BeerTile({
  beer,
  selected,
  onClick,
  disabled,
  className,
}: BeerTileProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-16 items-center justify-center rounded-md border px-3 text-base font-medium transition-colors',
        selected
          ? 'bg-primary text-primary-foreground border-primary'
          : 'border-input bg-background hover:bg-accent',
        disabled && 'opacity-50',
        className,
      )}
    >
      <span className="truncate">{beer.name}</span>
    </button>
  );
}

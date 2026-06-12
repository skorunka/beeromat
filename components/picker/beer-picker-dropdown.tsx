'use client';

import { useState } from 'react';
import { Beer, ChevronDown } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

// Spec 029 — common dropdown beer selector, mirroring
// MemberPickerDropdown. A select-style dropdown (holds a value) for
// flows that pick a beer then act (e.g. the inline on-behalf log on
// home), as opposed to the home one-tap chevron which logs on tap.
// Finger-sized items; out-of-stock options disabled.

export interface BeerPickerOption {
  id: string;
  name: string;
  unitPriceMinor: bigint;
  currentStock: number;
}

interface BeerPickerDropdownProps {
  beers: BeerPickerOption[];
  value: string | null;
  onChange: (beerId: string | null) => void;
  currencyCode: string;
  locale: string;
  placeholder: string;
  ariaLabel: string;
  className?: string;
  /** Lock the picker (e.g. while a submit is in flight). */
  disabled?: boolean;
}

const CLEAR_VALUE = '';

export function BeerPickerDropdown({
  beers,
  value,
  onChange,
  currencyCode,
  locale,
  placeholder,
  ariaLabel,
  className,
  disabled = false,
}: BeerPickerDropdownProps) {
  const picked = value ? beers.find((b) => b.id === value) ?? null : null;
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open && !disabled} onOpenChange={(next) => !disabled && setOpen(next)}>
      <DropdownMenuTrigger
        aria-label={ariaLabel}
        disabled={disabled}
        className={cn(
          'border-input bg-background hover:bg-accent flex h-12 w-full items-center justify-between gap-2 rounded-md border px-3 text-left text-base disabled:cursor-not-allowed disabled:opacity-60',
          className,
        )}
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          <Beer className="h-5 w-5 shrink-0" aria-hidden />
          <span className={cn('truncate', picked ? 'font-medium' : 'text-muted-foreground')}>
            {picked ? picked.name : placeholder}
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={4} className="min-w-(--anchor-width) p-1">
        <DropdownMenuRadioGroup
          value={value ?? CLEAR_VALUE}
          onValueChange={(v) => {
            onChange(v === CLEAR_VALUE ? null : v);
            setOpen(false);
          }}
        >
          {beers.map((b) => (
            <DropdownMenuRadioItem
              key={b.id}
              value={b.id}
              disabled={b.currentStock <= 0}
              className="min-h-12 gap-2 py-3 text-base"
            >
              <span className="flex-1 truncate">{b.name}</span>
              <span className="text-muted-foreground text-sm tabular-nums">
                {formatMoney(b.unitPriceMinor, currencyCode, locale)}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

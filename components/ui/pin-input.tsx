'use client';

import { forwardRef, type ChangeEvent, type FocusEvent } from 'react';

import { cn } from '@/lib/utils';

interface PinInputProps {
  length: number;
  value: string;
  onChange: (value: string) => void;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
  name?: string;
  autoFocus?: boolean;
  autoComplete?: string;
  ariaLabel?: string;
  className?: string;
}

// Segmented PIN entry — visually a row of evenly-spaced dots inside a
// rounded container; functionally a single masked input on top
// (preserves mobile numeric keyboard, SMS one-time-code autofill, and
// screen-reader access via the underlying <input>'s aria-label).
//
// Digits stay masked as dots even when typed — standard PIN security
// convention, and matches the all-dots aesthetic of the requested
// design. The container itself shows the focus ring (via
// :focus-within) so users see clearly that the field is focused even
// though the input's caret is transparent.
export const PinInput = forwardRef<HTMLInputElement, PinInputProps>(function PinInput(
  { length, value, onChange, onBlur, name, autoFocus, autoComplete, ariaLabel, className },
  ref,
) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    // Strip anything that isn't a digit; cap at the PIN length so
    // paste-of-too-much-text doesn't blow past the schema.
    const digitsOnly = event.target.value.replace(/\D/g, '').slice(0, length);
    onChange(digitsOnly);
  }

  return (
    <div
      className={cn(
        'border-input bg-muted focus-within:ring-ring relative h-14 w-full overflow-hidden rounded-xl border focus-within:ring-2',
        className,
      )}
    >
      <input
        ref={ref}
        type="tel"
        inputMode="numeric"
        autoComplete={autoComplete ?? 'one-time-code'}
        autoFocus={autoFocus}
        maxLength={length}
        name={name}
        value={value}
        onChange={handleChange}
        onBlur={onBlur}
        aria-label={ariaLabel}
        className="absolute inset-0 size-full cursor-text bg-transparent text-center text-transparent caret-transparent outline-none"
      />

      <div className="pointer-events-none absolute inset-0 flex items-center justify-around px-6">
        {Array.from({ length }).map((_, i) => {
          const filled = i < value.length;
          return (
            <span
              key={i}
              aria-hidden
              className={cn(
                'block h-2.5 w-2.5 rounded-full transition-colors',
                filled ? 'bg-foreground' : 'bg-muted-foreground/40',
              )}
            />
          );
        })}
      </div>
    </div>
  );
});

'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FlagIcon } from '@/components/ui/flag-icon';
import { routing } from '@/lib/i18n/routing';

// Locale endonyms — each language labelled in its own script.
// Same idiom used by the user-menu + admin config + setup wizard;
// keeping the map here means every dropdown reads the same way.
const LOCALE_LABEL: Record<string, string> = {
  cs: 'Čeština',
  en: 'English',
};

// Shared locale dropdown — owns its own `open` state so the popup
// closes the moment the user picks (base-ui RadioItem doesn't
// auto-close by default). Used by:
//   - ClubConfigForm (admin language switcher)
//   - SetupWizardForm (first-run admin language pick)
//
// The user-menu uses a slightly different shape (radio rows live
// alongside Account/Sign-out items), so it inlines its own.

interface LocaleDropdownProps {
  value: string;
  onChange: (next: string) => void;
  /** Optional className for the trigger. */
  className?: string;
}

export function LocaleDropdown({ value, onChange, className }: LocaleDropdownProps) {
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        className={
          className ??
          'border-input bg-background hover:bg-accent flex h-11 w-full items-center justify-between gap-2 rounded-md border px-3 text-sm'
        }
      >
        <span className="inline-flex items-center gap-2">
          <FlagIcon code={value} />
          {LOCALE_LABEL[value] ?? value.toUpperCase()}
        </span>
        <ChevronDown className="h-4 w-4 opacity-60" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={4}
        className="min-w-(--anchor-width)"
      >
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(v) => {
            onChange(v);
            setOpen(false);
          }}
        >
          {routing.locales.map((locale) => (
            <DropdownMenuRadioItem key={locale} value={locale}>
              <FlagIcon code={locale} />
              {LOCALE_LABEL[locale] ?? locale.toUpperCase()}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

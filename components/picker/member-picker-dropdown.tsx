'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { avatarUploadUrl } from '@/lib/avatars/upload-url';
import { cn } from '@/lib/utils';
import type { MemberOption } from './types';

// Spec 024 — dropdown-shape member picker used per seat on the
// /match new + edit forms. Built on the existing DropdownMenu
// primitive (base-ui via shadcn — same component the admin kebab
// + language switcher use).
//
// Trigger states:
//   - Unpicked (value === null): placeholder text + chevron, no avatar.
//   - Picked: <MemberAvatar size="row"> + displayName + chevron.
// Each option row in the popup carries the candidate's avatar at
// size="inline" + display name. The radio-checkmark indicator on
// the right marks the picked option.
//
// `disabledIds` is a set of member ids already assigned to other
// seats in the same agreement form. The picker excludes the
// current `value` from the disable effect so re-picking the same
// option works.

interface MemberPickerDropdownProps {
  members: MemberOption[];
  value: string | null;
  onChange: (memberId: string | null) => void;
  /** Set of member ids that are non-selectable in this picker
   *  (already assigned to another seat). The current `value` is
   *  automatically excluded — re-selecting your own seat works. */
  disabledIds?: Set<string>;
  /** Trigger label when value === null. */
  placeholder: string;
  /** Trigger aria-label (reuse existing seat-label copy). */
  ariaLabel: string;
  className?: string;
}

// Sentinel value used for the "clear" radio item — base-ui's
// RadioGroup uses string `value` and can't represent null directly.
const CLEAR_VALUE = '';

export function MemberPickerDropdown({
  members,
  value,
  onChange,
  disabledIds,
  placeholder,
  ariaLabel,
  className,
}: MemberPickerDropdownProps) {
  const t = useTranslations('common');
  const picked = value ? members.find((m) => m.id === value) ?? null : null;
  // Spec follow-up — close the popup as soon as a value is picked.
  // base-ui's RadioItem doesn't auto-close (designed for "select-
  // then-review"); our UX wants tap-and-go.
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const showSearch = members.length >= 8;
  const q = query.trim().toLowerCase();
  // Hide non-matches with `hidden` rather than removing them — keeps
  // base-ui's RadioGroup children set stable (mutating it while open
  // trips its reconciliation).
  const matches = (name: string) => !q || name.toLowerCase().includes(q);
  const anyVisible = members.some((m) => matches(m.displayName));

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <DropdownMenuTrigger
        aria-label={ariaLabel}
        className={cn(
          'border-input bg-background hover:bg-accent flex h-11 w-full items-center justify-between gap-2 rounded-md border px-3 text-left text-sm',
          className,
        )}
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          {picked ? (
            <>
              <MemberAvatar
                size="row"
                avatarKey={picked.avatarKey}
                displayName={picked.displayName}
                uploadUrl={avatarUploadUrl(picked.id, picked.avatarUploadAt)}
              />
              <span className="truncate">{picked.displayName}</span>
            </>
          ) : (
            <span className="text-muted-foreground truncate">{placeholder}</span>
          )}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
      </DropdownMenuTrigger>
      {/* Items sized for fingers: min-h-12 (48px) + text-base. base-ui's
          default ~32px is fine on desktop but a poor tap target on a
          phone — same fix as the bet-beer dropdown. */}
      <DropdownMenuContent
        align="start"
        sideOffset={4}
        className="min-w-(--anchor-width) p-1"
      >
        {showSearch ? (
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            // Let arrows/enter/escape reach the menu; keep typing keys
            // from triggering its built-in typeahead.
            onKeyDown={(e) => {
              if (e.key.length === 1 || e.key === 'Backspace') e.stopPropagation();
            }}
            placeholder={t('searchMember')}
            aria-label={t('searchMember')}
            className="border-input bg-background focus:border-primary mb-1 h-9 w-full rounded-md border px-2 text-sm outline-none"
          />
        ) : null}
        <DropdownMenuRadioGroup
          // CLEAR_VALUE ('') is the "nothing selected" sentinel for the
          // controlled group (no item checked until a member is picked).
          // Since the clear row is gone, every selectable item carries a
          // real member id, so onChange always receives a non-empty id.
          value={value ?? CLEAR_VALUE}
          onValueChange={(v) => {
            onChange(v);
            setOpen(false);
          }}
        >
          {/* No "clear" (—) row: it read as a confusing pre-selected
              blank ("is this a bug?"). Until a member is picked nothing
              is checked and the trigger shows the placeholder, making
              it clear you must choose someone. A seat can't be left
              empty on submit anyway, so clear-to-none had no real use. */}
          {members.map((m) => {
            // Disable only if explicitly disabled AND not the current value
            // (re-picking the same option must remain available).
            const isDisabled = disabledIds?.has(m.id) === true && m.id !== value;
            return (
              <DropdownMenuRadioItem
                key={m.id}
                value={m.id}
                disabled={isDisabled}
                className={cn('min-h-12 py-3 text-base', !matches(m.displayName) && 'hidden')}
              >
                <MemberAvatar
                  size="inline"
                  avatarKey={m.avatarKey}
                  displayName={m.displayName}
                  uploadUrl={avatarUploadUrl(m.id, m.avatarUploadAt)}
                />
                <span className="truncate">{m.displayName}</span>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
        {showSearch && q && !anyVisible ? (
          <p className="text-muted-foreground px-2 py-3 text-center text-sm">
            {t('noMembersFound')}
          </p>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

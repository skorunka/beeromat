'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Input } from '@/components/ui/input';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { avatarUploadUrl } from '@/lib/avatars/upload-url';
import { cn } from '@/lib/utils';
import type { MemberOption } from './types';

// Show the search box only once the roster is big enough to be worth
// filtering — small clubs don't need the extra control.
const SEARCH_THRESHOLD = 8;

// Spec 024 — tile-grid member picker used on /log/for.
//
// Visually mirrors the beer-tile grid already on the same form
// (the beer side uses h-16 tiles with the same selected-state
// styling: bg-primary text-primary-foreground border-primary).
// Tapping the already-selected tile clears the selection (mirrors
// the avatar-picker UX from spec 020).
//
// `value === null` is the unselected state. Callers translate to
// react-hook-form / useState shapes by mapping ''/null in their
// onChange handler.

interface MemberPickerGridProps {
  members: MemberOption[];
  value: string | null;
  onChange: (memberId: string | null) => void;
  ariaLabel?: string;
  className?: string;
}

export function MemberPickerGrid({
  members,
  value,
  onChange,
  ariaLabel,
  className,
}: MemberPickerGridProps) {
  const t = useTranslations('common');
  const [query, setQuery] = useState('');
  if (members.length === 0) return null;

  const showSearch = members.length >= SEARCH_THRESHOLD;
  const q = query.trim().toLowerCase();
  const filtered = q
    ? members.filter((m) => m.displayName.toLowerCase().includes(q))
    : members;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {showSearch ? (
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('searchMember')}
          aria-label={t('searchMember')}
        />
      ) : null}
      <div role="radiogroup" aria-label={ariaLabel} className="grid grid-cols-2 gap-2">
      {filtered.map((m) => {
        const isSelected = value === m.id;
        return (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onChange(isSelected ? null : m.id)}
            className={cn(
              'flex h-16 items-center gap-2 rounded-md border px-3 text-left transition-colors',
              isSelected
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-input bg-background hover:bg-accent',
            )}
          >
            <MemberAvatar
              size="row"
              avatarKey={m.avatarKey}
              displayName={m.displayName}
              uploadUrl={avatarUploadUrl(m.id, m.avatarUploadAt)}
            />
            <span className="min-w-0 truncate text-sm font-medium">{m.displayName}</span>
          </button>
        );
      })}
      </div>
      {showSearch && filtered.length === 0 ? (
        <p className="text-muted-foreground py-4 text-center text-sm">
          {t('noMembersFound')}
        </p>
      ) : null}
    </div>
  );
}

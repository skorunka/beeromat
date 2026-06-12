'use client';

import { useState } from 'react';
import { Check, Search } from 'lucide-react';

import { MemberAvatar } from '@/components/ui/member-avatar';
import { avatarUploadUrl } from '@/lib/avatars/upload-url';
import { cn } from '@/lib/utils';
import type { MemberOption } from './types';

// Spec 033 — avatar toggle grid for composing a round's drinkers. Each
// tile is an aria-pressed button; selected tiles get a ring + check. The
// logger's tile is flagged (isSelf) so it can be pre-selected + labelled.
// 033 follow-up: at >= 8 members a search box filters the grid (big-club
// ergonomics); selected tiles stay visible even when they don't match.
// All strings come in via props — no literals here.

export interface RoundMemberOption extends MemberOption {
  isSelf: boolean;
  /** Caller's recent companion (their usual table) — floated to the top. */
  recent: boolean;
}

interface MemberMultiSelectProps {
  members: RoundMemberOption[];
  selected: Set<string>;
  onToggle: (memberId: string) => void;
  /** Short label for the logger's own tile, e.g. "ty" / "you". */
  selfLabel: string;
  /** Placeholder for the search box (shown at >= 8 members). */
  searchPlaceholder: string;
  /** Lock all toggles + search (e.g. while a submit is in flight). */
  disabled?: boolean;
}

const SEARCH_THRESHOLD = 8;

export function MemberMultiSelect({
  members,
  selected,
  onToggle,
  selfLabel,
  searchPlaceholder,
  disabled = false,
}: MemberMultiSelectProps) {
  const [query, setQuery] = useState('');
  const showSearch = members.length >= SEARCH_THRESHOLD;
  const q = query.trim().toLowerCase();
  // A tile is visible when it matches the query OR is already selected
  // (so a search never hides someone you've picked).
  const isVisible = (m: RoundMemberOption) =>
    !q || selected.has(m.id) || m.displayName.toLowerCase().includes(q);

  return (
    <div className="flex flex-col gap-2">
      {showSearch ? (
        <div className="border-input bg-background flex h-9 items-center gap-2 rounded-md border px-2">
          <Search className="text-muted-foreground h-4 w-4 shrink-0" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={disabled}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="w-full bg-transparent text-sm outline-none disabled:opacity-60"
          />
        </div>
      ) : null}

      <div className="grid grid-cols-5 gap-1.5">
        {members.map((m) => {
          const isSelected = selected.has(m.id);
          const label = m.isSelf ? selfLabel : m.displayName.split(' ')[0];
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onToggle(m.id)}
              disabled={disabled}
              aria-pressed={isSelected}
              aria-label={m.isSelf ? `${m.displayName} (${selfLabel})` : m.displayName}
              className={cn(
                'relative flex w-full flex-col items-center gap-1 rounded-lg p-1.5 transition disabled:cursor-not-allowed',
                isSelected
                  ? 'bg-primary/10 ring-primary ring-2'
                  : 'opacity-55 hover:opacity-90',
                !isVisible(m) && 'hidden',
              )}
            >
              <MemberAvatar
                size="row"
                avatarKey={m.avatarKey}
                displayName={m.displayName}
                uploadUrl={avatarUploadUrl(m.id, m.avatarUploadAt)}
              />
              <span className="max-w-full truncate text-xs font-medium">{label}</span>
              {isSelected ? (
                <span
                  aria-hidden
                  className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full"
                >
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

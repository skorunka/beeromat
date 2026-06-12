'use client';

import { Check } from 'lucide-react';

import { MemberAvatar } from '@/components/ui/member-avatar';
import { avatarUploadUrl } from '@/lib/avatars/upload-url';
import { cn } from '@/lib/utils';
import type { MemberOption } from './types';

// Spec 033 — avatar toggle grid for composing a round's drinkers. Each
// tile is an aria-pressed button; selected tiles get a ring + check. The
// logger's tile is flagged (isSelf) so it can be pre-selected + labelled.
// Strings come in via props (selfLabel) — no literals here.

export interface RoundMemberOption extends MemberOption {
  isSelf: boolean;
}

interface MemberMultiSelectProps {
  members: RoundMemberOption[];
  selected: Set<string>;
  onToggle: (memberId: string) => void;
  /** Short label for the logger's own tile, e.g. "ty" / "you". */
  selfLabel: string;
}

export function MemberMultiSelect({
  members,
  selected,
  onToggle,
  selfLabel,
}: MemberMultiSelectProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {members.map((m) => {
        const isSelected = selected.has(m.id);
        const label = m.isSelf ? selfLabel : m.displayName.split(' ')[0];
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onToggle(m.id)}
            aria-pressed={isSelected}
            aria-label={m.isSelf ? `${m.displayName} (${selfLabel})` : m.displayName}
            className={cn(
              'relative inline-flex w-16 flex-col items-center gap-1 rounded-lg p-1.5 transition',
              isSelected
                ? 'bg-primary/10 ring-primary ring-2'
                : 'opacity-55 hover:opacity-90',
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
  );
}

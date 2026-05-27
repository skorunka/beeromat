'use client';

import { useRef, useState, useTransition } from 'react';
import { Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { BeerSpinner } from '@/components/ui/beer-spinner';
import { setSessionTitleAction } from '@/app/[locale]/(app)/tab/actions';
import { SESSION_TITLE_MAX_LENGTH } from '@/lib/validation/session-title';
import { cn } from '@/lib/utils';

interface SessionTitleInlineEditProps {
  sessionId: string;
  currentTitle: string | null;
  fallbackLabel: string;
  className?: string;
}

// Spec 022 — inline editable session title.
//
// Idle: renders the title (or fallback) as a button-like affordance.
// Editing: input replaces the text in-place with the same visual
// weight. Enter / blur save; Esc cancels. The component owns its
// own optimistic state so the visible value updates the instant
// the user commits — the server action revalidates the surrounding
// page, which catches up on the next render tick.
//
// Permission gate: action-side (any active member of the same club).
// The component renders the affordance to everyone; the server
// rejects cross-club edits with NOT_FOUND.
export function SessionTitleInlineEdit({
  sessionId,
  currentTitle,
  fallbackLabel,
  className,
}: SessionTitleInlineEditProps) {
  const t = useTranslations('session.title');
  const [title, setTitle] = useState<string | null>(currentTitle);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(currentTitle ?? '');
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Esc must beat the blur-saves-on-exit rule. Tracked on a ref so the
  // blur handler can read it without the state update racing.
  const cancelledRef = useRef(false);

  function commit() {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      setEditing(false);
      setDraft(title ?? '');
      return;
    }
    const next = draft.trim();
    const nextTitle = next.length === 0 ? null : next;
    // Same value as what's already stored — no-op (no toast, no
    // network round-trip, no flash of the spinner).
    if (nextTitle === title) {
      setEditing(false);
      setDraft(title ?? '');
      return;
    }
    const previous = title;
    setTitle(nextTitle);
    setEditing(false);
    startTransition(async () => {
      const result = await setSessionTitleAction({
        sessionId,
        title: nextTitle,
      });
      if (!result.ok) {
        // Rollback optimistic update + surface the error.
        setTitle(previous);
        setDraft(previous ?? '');
        toast.error(t('saveError'));
      }
    });
  }

  function startEdit() {
    setDraft(title ?? '');
    setEditing(true);
    // RAF so the input mounts before we try to focus it.
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }

  if (editing) {
    return (
      <span className={cn('inline-flex w-full items-center gap-2', className)}>
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancelledRef.current = true;
              setEditing(false);
              setDraft(title ?? '');
            }
          }}
          onBlur={commit}
          maxLength={SESSION_TITLE_MAX_LENGTH}
          placeholder={t('placeholder')}
          aria-label={t('editAriaLabel')}
          className={cn(
            'flex-1 min-w-0 rounded-sm border-b border-dashed border-current bg-transparent',
            'px-0 py-0 leading-tight outline-none',
            'focus:border-solid focus:border-primary',
          )}
        />
      </span>
    );
  }

  return (
    <span className={cn('inline-flex w-full items-center gap-2', className)}>
      <button
        type="button"
        onClick={startEdit}
        aria-label={t('editAriaLabel')}
        className={cn(
          'group inline-flex max-w-full items-center gap-1.5 text-left',
          'truncate rounded-sm focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none',
        )}
      >
        <span className="truncate">{title ?? fallbackLabel}</span>
        <Pencil
          aria-hidden
          className="text-muted-foreground h-3.5 w-3.5 shrink-0 opacity-60 group-hover:opacity-100"
        />
      </button>
      {isPending ? <BeerSpinner className="h-3.5 w-3.5" /> : null}
    </span>
  );
}

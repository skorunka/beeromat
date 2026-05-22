'use client';

import { useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';

import { Link } from '@/lib/i18n/navigation';

export interface DisputedClaimView {
  paymentId: string;
  amountDisplay: string;
  reason: string | null;
}

const STORAGE_KEY = 'beeromat:dismissed-disputes';
const EMPTY: ReadonlySet<string> = new Set();

// localStorage-backed store of dismissed dispute ids, exposed via
// useSyncExternalStore so reads are SSR-safe (server snapshot is empty)
// with no hydration mismatch and no setState-in-effect.
const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedSet: ReadonlySet<string> = EMPTY;

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

function getSnapshot(): ReadonlySet<string> {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cachedSet = new Set(JSON.parse(raw ?? '[]') as string[]);
    } catch {
      cachedSet = EMPTY;
    }
  }
  return cachedSet;
}

function getServerSnapshot(): ReadonlySet<string> {
  return EMPTY;
}

function dismissDispute(paymentId: string): void {
  const next = [...getSnapshot(), paymentId];
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  for (const onChange of listeners) onChange();
}

/**
 * One-time banner shown on protected pages when a member has a disputed
 * payment claim (FR-034 b). Dismissal is remembered per-claim on the
 * device, so a dispute the member has already seen stops nagging.
 */
export function DisputeBanner({ claims }: { claims: DisputedClaimView[] }) {
  const t = useTranslations('dispute');
  const dismissed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const visible = claims.filter((c) => !dismissed.has(c.paymentId));
  if (visible.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 p-4">
      {visible.map((claim) => (
        <div
          key={claim.paymentId}
          className="border-destructive/40 bg-destructive/10 text-destructive flex flex-col gap-1 rounded-lg border p-3 text-sm"
        >
          <p>
            {claim.reason
              ? t('bannerWithReason', { amount: claim.amountDisplay, reason: claim.reason })
              : t('banner', { amount: claim.amountDisplay })}
          </p>
          {/* An actionable next step, not just an explanation (v1.3 F19). */}
          <div className="flex items-center gap-4">
            <Link
              href="/settle"
              className="inline-flex min-h-11 items-center font-medium underline"
            >
              {t('action')}
            </Link>
            <button
              type="button"
              onClick={() => dismissDispute(claim.paymentId)}
              className="text-muted-foreground inline-flex min-h-11 items-center underline"
              aria-label={t('dismiss')}
            >
              {t('dismiss')}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

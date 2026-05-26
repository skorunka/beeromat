import type { Route } from 'next';
import { getTranslations } from 'next-intl/server';

import { Link } from '@/lib/i18n/navigation';

// Spec 019 — small muted-text link to the on-behalf flow page.
// Rendered on (a) home below the one-tap log button and (b) /log
// below the catalog. Returns null when the club has no other
// active members (the affordance is moot).

export async function LogForOtherLink({
  hasOtherMembers,
  className,
}: {
  hasOtherMembers: boolean;
  className?: string;
}) {
  if (!hasOtherMembers) return null;
  const t = await getTranslations('log.onBehalf');
  return (
    <Link
      href={'/log/for' as Route}
      className={
        className ??
        'text-muted-foreground hover:text-foreground inline-flex min-h-9 items-center justify-center text-sm underline-offset-4 hover:underline'
      }
    >
      {t('ctaLink')}
    </Link>
  );
}

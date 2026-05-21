'use client';

import { useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { setLocaleCookie } from '@/lib/i18n/actions';
import { usePathname, useRouter } from '@/lib/i18n/navigation';
import { routing } from '@/lib/i18n/routing';

// Two-letter locale codes — universal, not translated.
const LABEL: Record<string, string> = { cs: 'CS', en: 'EN' };

/**
 * Compact CS / EN switcher. Records the choice in the NEXT_LOCALE
 * cookie via a Server Action (proxy.ts honours it on later visits) and
 * navigates to the same screen in the chosen locale.
 */
export function LanguageSwitcher() {
  const active = useLocale();
  const t = useTranslations('nav');
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function switchTo(locale: string) {
    if (locale === active || isPending) return;
    startTransition(async () => {
      await setLocaleCookie(locale);
      router.replace(pathname, { locale });
    });
  }

  return (
    <div className="flex gap-1" role="group" aria-label={t('language')}>
      {routing.locales.map((loc) => (
        <button
          key={loc}
          type="button"
          onClick={() => switchTo(loc)}
          disabled={isPending}
          aria-current={loc === active ? 'true' : undefined}
          className={`rounded-md px-2 py-1 text-xs font-medium ${
            loc === active
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent'
          }`}
        >
          {LABEL[loc]}
        </button>
      ))}
    </div>
  );
}

'use client';

import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

interface BrandMarkProps {
  className?: string;
}

export function BrandMark({ className }: BrandMarkProps) {
  const t = useTranslations('common');
  return (
    <span
      className={cn(
        'text-primary inline-flex items-center gap-1.5 font-bold uppercase',
        className,
      )}
    >
      <span aria-hidden className="text-sm leading-none">
        🍺
      </span>
      <span className="text-xs tracking-[0.2em]">{t('brand')}</span>
    </span>
  );
}

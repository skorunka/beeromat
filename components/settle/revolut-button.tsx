import { getTranslations } from 'next-intl/server';

import { buttonVariants } from '@/components/ui/button';

interface RevolutButtonProps {
  revolutUrl: string | null;
  amountDisplay: string;
}

/**
 * Conditional alternative payment route — only rendered when the club
 * has a Revolut handle configured (FR-038).
 */
export async function RevolutButton({ revolutUrl, amountDisplay }: RevolutButtonProps) {
  if (!revolutUrl) return null;
  const t = await getTranslations('settle');

  return (
    <a
      href={revolutUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={buttonVariants({ variant: 'outline', className: 'mb-4 h-12 w-full' })}
    >
      {t('payWithRevolut', { amount: amountDisplay })}
    </a>
  );
}

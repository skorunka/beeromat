import { buttonVariants } from '@/components/ui/button';

interface RevolutButtonProps {
  revolutUrl: string | null;
  amountDisplay: string;
}

/**
 * Conditional alternative payment route — only rendered when the club
 * has a Revolut handle configured (FR-038).
 */
export function RevolutButton({ revolutUrl, amountDisplay }: RevolutButtonProps) {
  if (!revolutUrl) return null;

  return (
    <a
      href={revolutUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={buttonVariants({ variant: 'outline', className: 'mb-4 h-10 w-full' })}
    >
      Pay {amountDisplay} with Revolut
    </a>
  );
}

import { useTranslations } from 'next-intl';

import type { FunLine } from '@/lib/stats/types';

// Spec 034 — renders the top 1–2 playful lines a member's stats earned.
// Each line's copy + plurals live in the funline.* catalog (cs/en).
export function FunLines({ lines }: { lines: FunLine[] }) {
  const t = useTranslations();
  if (lines.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {lines.slice(0, 2).map((line) => (
        <p
          key={line.key}
          className="bg-primary/10 text-foreground rounded-lg px-3 py-2 text-sm font-medium"
        >
          {t(line.key, line.params)}
        </p>
      ))}
    </div>
  );
}

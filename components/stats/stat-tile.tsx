import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

// Spec 034 — a labelled stat on a player profile (e.g. "Won · 23").
export function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <Card className="flex flex-col gap-0.5 p-3">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={cn('text-lg font-bold tabular-nums', accent && 'text-primary')}>{value}</span>
    </Card>
  );
}

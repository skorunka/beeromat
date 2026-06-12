import type { Route } from 'next';

import { Link } from '@/lib/i18n/navigation';

// Spec 034 — tappable player chips on a match: each links to that member's
// profile, so you can drill from a match into a player's stats. No literal
// copy here — names are data, the route is derived.
export function MatchPlayers({ players }: { players: { memberId: string; displayName: string }[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {players.map((p) => (
        <Link
          key={p.memberId}
          href={`/members/${p.memberId}` as Route}
          className="border-border bg-card hover:bg-accent rounded-full border px-3 py-1 text-sm font-medium transition-colors"
        >
          {p.displayName}
        </Link>
      ))}
    </div>
  );
}

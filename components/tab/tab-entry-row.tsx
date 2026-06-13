import type { Route } from 'next';
import { useTranslations } from 'next-intl';

import { Link } from '@/lib/i18n/navigation';
import { UndoButton } from '@/components/log/undo-button';
import { Card } from '@/components/ui/card';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { avatarUploadUrl } from '@/lib/avatars/upload-url';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format';
import type { MemberTabEntry } from '@/lib/db/queries/consumption';

// Spec 019 — single /tab row, handling all four origin types
// (self-logged / on-behalf / won-bet / lost-bet). Stays a server
// component (no interactivity beyond the existing UndoButton).

interface TabEntryRowProps {
  entry: MemberTabEntry;
  currencyCode: string;
  locale: string;
}

export function TabEntryRow({ entry, currencyCode, locale }: TabEntryRowProps) {
  const t = useTranslations('tab');

  const timeStr = new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(
    entry.createdAt,
  );

  // Subtitle: which origin badge to show (one only, in priority order).
  // - On-behalf "od X" wins when present (always shown for non-self logs).
  // - Source-match "ze zápasu →" for the winner of a bet (consumption
  //   row sourcing an active bet_transfer).
  // - Transfer-in rows render a different layout entirely (see below).
  let subtitle: React.ReactNode = null;
  if (entry.kind === 'consumption') {
    if (entry.loggerDisplayName || entry.fromRound) {
      subtitle = (
        <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
          {/* Spec 033 — a beer poured as part of a round wears a small
              "Runda" badge, so a member can see at a glance why this beer
              is on their tab (paired with the "od X" line below it). */}
          {entry.fromRound ? (
            <span className="bg-primary/15 text-primary inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
              🍺 {t('roundBadge')}
            </span>
          ) : null}
          {entry.loggerMemberId ? (
            // Spec 023 — logger's face leads the "od X" attribution.
            // Spec 036 — avatar + name link to the logger's profile (Runda
            // badge stays outside the link). Text-only fallback when the
            // on-behalf join couldn't resolve a member id.
            <Link
              href={`/members/${entry.loggerMemberId}` as Route}
              className="hover:text-foreground inline-flex items-center gap-1.5 underline-offset-2 hover:underline"
            >
              <MemberAvatar
                size="inline"
                avatarKey={entry.loggerAvatarKey}
                displayName={entry.loggerDisplayName ?? ''}
                uploadUrl={avatarUploadUrl(entry.loggerMemberId, entry.loggerAvatarUploadAt)}
              />
              {entry.loggerDisplayName ? t('byOther', { logger: entry.loggerDisplayName }) : null}
            </Link>
          ) : entry.loggerDisplayName ? (
            t('byOther', { logger: entry.loggerDisplayName })
          ) : null}
        </span>
      );
    } else if (entry.sourceMatchId) {
      subtitle = (
        <Link
          href={`/match/${entry.sourceMatchId}` as Route}
          className="text-muted-foreground hover:text-foreground mt-0.5 inline-flex text-xs underline-offset-2 hover:underline"
        >
          {t('fromMatch')}
        </Link>
      );
    }
  }

  // Won-bet rows (transfer_out): the member drank this beer but won
  // the bet, so the cost moved to the loser. Shown for transparency
  // with the price struck through — it does NOT count toward the
  // member's total (parity with the balance).
  if (entry.kind === 'transfer_out') {
    return (
      <li>
        <Card className="flex flex-row items-center justify-between gap-3 p-3">
        <div className="min-w-0">
          <div className="text-sm font-medium leading-snug">
            {t('wonBet', {
              logger: entry.loggerDisplayName ?? '?',
              beer: entry.beerTypeName,
            })}
          </div>
          <div className="text-muted-foreground text-xs">
            {timeStr}
            {entry.sourceMatchId ? (
              <>
                {' · '}
                <Link
                  href={`/match/${entry.sourceMatchId}` as Route}
                  className="hover:text-foreground underline-offset-2 hover:underline"
                >
                  {t('fromMatch')}
                </Link>
              </>
            ) : null}
          </div>
        </div>
        <div className="text-muted-foreground font-mono text-sm line-through">
          {formatMoney(entry.unitPriceMinor, currencyCode, locale)}
        </div>
        </Card>
      </li>
    );
  }

  // Lost-bet rows: distinct layout — "z prohrané sázky: X · Beer"
  // as the primary line, no Undo button (transfers aren't undoable
  // from /tab; the match-void path handles it).
  if (entry.kind === 'transfer_in') {
    return (
      <li>
        <Card
          className={cn(
            'flex flex-row items-center justify-between gap-3 p-3',
            entry.voided && 'opacity-50',
          )}
        >
        <div className="min-w-0">
          <div className="text-sm font-medium leading-snug">
            {t('fromBet', {
              logger: entry.loggerDisplayName ?? '?',
              beer: entry.beerTypeName,
            })}
          </div>
          <div className="text-muted-foreground text-xs">
            {timeStr}
            {entry.sourceMatchId ? (
              <>
                {' · '}
                <Link
                  href={`/match/${entry.sourceMatchId}` as Route}
                  className="hover:text-foreground underline-offset-2 hover:underline"
                >
                  {t('fromMatch')}
                </Link>
              </>
            ) : null}
          </div>
        </div>
        <div className="font-mono text-sm">
          {formatMoney(entry.unitPriceMinor, currencyCode, locale)}
        </div>
        </Card>
      </li>
    );
  }

  // Standard consumption row (self or on-behalf).
  return (
    <li>
      <Card
        className={cn(
          'flex flex-row items-center justify-between gap-3 p-3',
          entry.voided && 'opacity-50',
        )}
      >
      <div className="min-w-0">
        <div className="font-medium">{entry.beerTypeName}</div>
        <div className="text-muted-foreground text-xs">
          {timeStr}
          {entry.voided ? ` · ${t('voided')}` : null}
        </div>
        {subtitle}
      </div>
      <div className="flex items-center gap-3">
        <div className="font-mono text-sm">
          {formatMoney(entry.unitPriceMinor, currencyCode, locale)}
        </div>
        {entry.canUndo ? <UndoButton consumptionId={entry.id} /> : null}
      </div>
      </Card>
    </li>
  );
}

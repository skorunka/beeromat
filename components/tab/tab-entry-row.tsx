import type { Route } from 'next';
import { useTranslations } from 'next-intl';

import { Link } from '@/lib/i18n/navigation';
import { UndoButton } from '@/components/log/undo-button';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { avatarUploadUrl } from '@/lib/avatars/upload-url';
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
    if (entry.loggerDisplayName) {
      subtitle = (
        <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
          {entry.loggerMemberId ? (
            // Spec 023 — logger's face leads the "od X" attribution
            // when we have the avatar fields. Falls through to text-only
            // when the row is on-behalf but the join couldn't resolve.
            <MemberAvatar
              size="inline"
              avatarKey={entry.loggerAvatarKey}
              displayName={entry.loggerDisplayName}
              uploadUrl={avatarUploadUrl(entry.loggerMemberId, entry.loggerAvatarUploadAt)}
            />
          ) : null}
          {t('byOther', { logger: entry.loggerDisplayName })}
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
      <li className="flex items-center justify-between rounded-md border p-3">
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
      </li>
    );
  }

  // Lost-bet rows: distinct layout — "z prohrané sázky: X · Beer"
  // as the primary line, no Undo button (transfers aren't undoable
  // from /tab; the match-void path handles it).
  if (entry.kind === 'transfer_in') {
    return (
      <li
        className={`flex items-center justify-between rounded-md border p-3 ${entry.voided ? 'opacity-50' : ''}`}
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
      </li>
    );
  }

  // Standard consumption row (self or on-behalf).
  return (
    <li
      className={`flex items-center justify-between rounded-md border p-3 ${entry.voided ? 'opacity-50' : ''}`}
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
    </li>
  );
}

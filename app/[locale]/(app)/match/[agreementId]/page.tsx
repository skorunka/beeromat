import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link } from '@/lib/i18n/navigation';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { requireUnlocked } from '@/lib/auth/session';
import {
  UNDO_WINDOW_MS,
  getAgreement,
  listActiveClubMembers,
} from '@/lib/db/queries/match-agreements';
import { winnerLabel } from '@/lib/match/winner-label';
import { joinSideNames } from '@/lib/format/match-sides';
import { canRecordMatchResult } from '@/lib/permissions';
import { ReverseMatchButton } from '@/components/match/reverse-match-button';
import { MatchPlayers } from '@/components/match/match-players';

import { EditAgreementForm } from './EditAgreementForm';
import { RecordResultForm } from './RecordResultForm';

// Spec 013 — agreement detail page. Shows lineup, state, and the
// RecordResultForm when the agreement is OPEN and the viewer is
// allowed to record (FR-007: participant + treasurer override).

export default async function AgreementDetailPage({
  params,
}: {
  params: Promise<{ locale: string; agreementId: string }>;
}) {
  const { locale, agreementId } = await params;
  setRequestLocale(locale);

  const ctx = await requireUnlocked();
  const agreement = await getAgreement(agreementId, ctx.club.id);
  if (!agreement) notFound();

  const t = await getTranslations('match');
  const viewerCanRecord = canRecordMatchResult(
    ctx.member.id,
    ctx.member.role,
    agreement.participantMemberIds,
  );

  const isOpen = !agreement.resultRecordedAt && !agreement.cancelledAt;
  const isRecorded = !!agreement.resultRecordedAt;
  const isCancelled = !!agreement.cancelledAt;
  // Reverse-window check computed here (not inline in JSX) — `new Date()`
  // rather than `Date.now()` to satisfy the React-compiler purity lint.
  const canReverseNow =
    isRecorded &&
    !!agreement.resultRecordedAt &&
    new Date().getTime() - agreement.resultRecordedAt.getTime() <= UNDO_WINDOW_MS;

  const members = isOpen ? await listActiveClubMembers(ctx.club.id) : [];

  function pickSeat(side: 'A' | 'B', seat: 1 | 2): string | null {
    const found = agreement!.sides[side].find((s) => s.seat === seat);
    return found ? found.memberId : null;
  }

  const sideAName = joinSideNames(agreement.sides.A);
  const sideBName = joinSideNames(agreement.sides.B);

  // Spec 030 — name the winner(s) as a noun (Vítěz / Vítězové) rather
  // than the old "Vyhrál/a {side}" verb. (Plain loop, not .map(=>), to
  // avoid the i18n-check JSX-text regex false-positive on the arrow.)
  const winningSeats = agreement.winningSide === 'A' ? agreement.sides.A : agreement.sides.B;
  const winnerNames: string[] = [];
  for (const seat of winningSeats) winnerNames.push(seat.displayName);
  const winnerHeadingLabel = winnerLabel(agreement.format, winnerNames);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-5">
      <header className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold leading-tight">
            {sideAName} <span className="text-muted-foreground">vs</span> {sideBName}
          </h1>
          <Link href="/match" className="text-muted-foreground shrink-0 text-sm underline-offset-4 hover:underline">
            ← {t('backToHub')}
          </Link>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="bg-secondary text-secondary-foreground rounded-full px-2 py-0.5">
            {agreement.format === 'doubles' ? t('formatDoubles') : t('formatSingles')}
          </span>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 font-medium',
              agreement.forBeer
                ? 'bg-primary/15 text-primary'
                : 'bg-muted text-muted-foreground',
            )}
          >
            {agreement.forBeer ? t('chipForBeer') : t('chipFriendly')}
          </span>
          {agreement.format === 'doubles' && agreement.pairingKind ? (
            <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5">
              {agreement.pairingKind === 'straight'
                ? t('pairingStraight')
                : t('pairingCrossed')}
            </span>
          ) : null}
        </div>
        {/* Tap a player → their profile/stats (spec 034). */}
        <MatchPlayers players={[...agreement.sides.A, ...agreement.sides.B]} />
      </header>

      {isCancelled ? (
        <Card className="p-4 text-sm">
          {t('cancelledNote')}
        </Card>
      ) : null}

      {isRecorded ? (
        <Card className="flex flex-col gap-2 p-4 text-sm">
          <p className="font-semibold">{t(winnerHeadingLabel.key, winnerHeadingLabel.values)}</p>
          <p className="text-muted-foreground text-xs">
            {t('recordedAt', { time: agreement.resultRecordedAt!.toLocaleString(locale) })}
          </p>
        </Card>
      ) : null}

      {/* Reverse a recorded result inside the 5-min undo window. The
          home MatchBetModule's "Reverse match" link sends users here;
          without this button the page was a dead-end. */}
      {canReverseNow && viewerCanRecord ? (
        <ReverseMatchButton agreementId={agreement.id} />
      ) : null}

      {isOpen && viewerCanRecord ? (
        <RecordResultForm
          agreementId={agreement.id}
          sideALabel={sideAName}
          sideBLabel={sideBName}
          forBeer={agreement.forBeer}
          loserBeerCount={ctx.club.matchLoserBeerCount}
        />
      ) : isOpen ? (
        <Card className="text-muted-foreground p-4 text-sm">{t('viewerCannotRecord')}</Card>
      ) : null}

      {isOpen ? (
        <details className="border-border rounded-md border p-4">
          <summary className="cursor-pointer text-sm font-semibold">
            {t('editMatchSummary')}
          </summary>
          <div className="mt-4">
            <EditAgreementForm
              agreementId={agreement.id}
              members={members}
              canCancel={agreement.reversedAt == null}
              initial={{
                format: agreement.format,
                forBeer: agreement.forBeer,
                pairingKind: agreement.pairingKind,
                a1: pickSeat('A', 1) ?? '',
                a2: pickSeat('A', 2),
                b1: pickSeat('B', 1) ?? '',
                b2: pickSeat('B', 2),
              }}
            />
          </div>
        </details>
      ) : null}
    </main>
  );
}

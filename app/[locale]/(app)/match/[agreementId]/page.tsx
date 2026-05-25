import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link } from '@/lib/i18n/navigation';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { requireUnlocked } from '@/lib/auth/session';
import { getAgreement } from '@/lib/db/queries/match-agreements';
import { joinSideNames } from '@/lib/format/match-sides';
import { canRecordMatchResult } from '@/lib/permissions';

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

  const sideAName = joinSideNames(agreement.sides.A);
  const sideBName = joinSideNames(agreement.sides.B);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-5">
      <header className="flex flex-col gap-2">
        <Link href="/match" className="text-muted-foreground text-sm underline-offset-4 hover:underline">
          ← {t('backToHub')}
        </Link>
        <h1 className="text-2xl font-bold leading-tight">
          {sideAName} <span className="text-muted-foreground">vs</span> {sideBName}
        </h1>
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
      </header>

      {isCancelled ? (
        <Card className="p-4 text-sm">
          {t('cancelledNote')}
        </Card>
      ) : null}

      {isRecorded ? (
        <Card className="flex flex-col gap-2 p-4 text-sm">
          <p className="font-semibold">
            {t('recordedHeading', {
              side: agreement.winningSide === 'A' ? sideAName : sideBName,
            })}
          </p>
          <p className="text-muted-foreground text-xs">
            {t('recordedAt', { time: agreement.resultRecordedAt!.toLocaleString(locale) })}
          </p>
        </Card>
      ) : null}

      {isOpen && viewerCanRecord ? (
        <RecordResultForm
          agreementId={agreement.id}
          sideALabel={sideAName}
          sideBLabel={sideBName}
        />
      ) : isOpen ? (
        <Card className="text-muted-foreground p-4 text-sm">{t('viewerCannotRecord')}</Card>
      ) : null}
    </main>
  );
}

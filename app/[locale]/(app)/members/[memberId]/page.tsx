import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { requireUnlocked } from '@/lib/auth/session';
import { getPlayerStats } from '@/lib/db/queries/player-stats';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { avatarUploadUrl } from '@/lib/avatars/upload-url';
import { StatTile } from '@/components/stats/stat-tile';
import { StatPersonCard } from '@/components/stats/head-to-head-card';
import { FunLines } from '@/components/stats/fun-line';
import { selectFunLines } from '@/lib/stats/fun-lines';
import { formatMoney } from '@/lib/format';

// Spec 034 — a player's profile: match record, streaks, rivals, partners,
// beer aggregates, tab. Reachable by tapping a member anywhere.
export default async function ProfilePage({
  params,
}: {
  params: Promise<{ locale: string; memberId: string }>;
}) {
  const { locale, memberId } = await params;
  setRequestLocale(locale);

  const ctx = await requireUnlocked();
  const t = await getTranslations('stats.profile');
  const stats = await getPlayerStats({ clubId: ctx.club.id, memberId });
  if (!stats) notFound();

  const { currencyCode, defaultLocale } = ctx.club;
  const DASH = '—';
  const wl = (w: number, l: number) => `${w}–${l}`;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-5 p-5">
      <header className="flex items-center gap-3">
        <MemberAvatar
          avatarKey={stats.avatarKey}
          displayName={stats.displayName}
          uploadUrl={avatarUploadUrl(stats.memberId, stats.avatarUploadAt)}
          className="h-14 w-14 text-lg"
        />
        <h1 className="text-2xl font-bold">{stats.displayName}</h1>
      </header>

      <FunLines lines={selectFunLines(stats)} />

      <section className="flex flex-col gap-2">
        <h2 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
          {t('recordHeading')}
        </h2>
        <div className="grid grid-cols-3 gap-2">
          <StatTile label={t('played')} value={String(stats.matchesPlayed)} />
          <StatTile label={t('won')} value={String(stats.won)} accent />
          <StatTile label={t('lost')} value={String(stats.lost)} />
          <StatTile
            label={t('winRate')}
            value={stats.winRatio === null ? DASH : `${Math.round(stats.winRatio * 100)}%`}
          />
          <StatTile label={t('currentStreak')} value={String(stats.currentStreak)} />
          <StatTile label={t('bestStreak')} value={String(stats.bestStreak)} />
        </div>
      </section>

      {stats.nemesis || stats.favouriteVictim ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            {t('rivalsHeading')}
          </h2>
          {stats.nemesis ? (
            <StatPersonCard
              caption={t('nemesis')}
              memberId={stats.nemesis.opponentId}
              face={stats.nemesis}
              record={wl(stats.nemesis.wins, stats.nemesis.losses)}
            />
          ) : null}
          {stats.favouriteVictim ? (
            <StatPersonCard
              caption={t('victim')}
              memberId={stats.favouriteVictim.opponentId}
              face={stats.favouriteVictim}
              record={wl(stats.favouriteVictim.wins, stats.favouriteVictim.losses)}
            />
          ) : null}
        </section>
      ) : null}

      {stats.bestPartner || stats.jinxPartner ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            {t('partnersHeading')}
          </h2>
          {stats.bestPartner ? (
            <StatPersonCard
              caption={t('bestPartner')}
              memberId={stats.bestPartner.partnerId}
              face={stats.bestPartner}
              record={`${stats.bestPartner.wins}/${stats.bestPartner.games}`}
            />
          ) : null}
          {stats.jinxPartner ? (
            <StatPersonCard
              caption={t('jinxPartner')}
              memberId={stats.jinxPartner.partnerId}
              face={stats.jinxPartner}
              record={`${stats.jinxPartner.wins}/${stats.jinxPartner.games}`}
            />
          ) : null}
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
          {t('beerHeading')}
        </h2>
        <div className="grid grid-cols-2 gap-2">
          <StatTile label={t('totalBeers')} value={String(stats.totalBeers)} />
          <StatTile
            label={t('beersPerNight')}
            value={stats.beersPerNight === null ? DASH : String(stats.beersPerNight)}
          />
          <StatTile label={t('roundsPoured')} value={String(stats.roundsPoured)} />
          <StatTile label={t('tab')} value={formatMoney(stats.tabMinor, currencyCode, defaultLocale)} accent />
        </div>
        {stats.favouriteBeer ? (
          <p className="text-muted-foreground text-sm">
            {t('favouriteBeer', { beer: stats.favouriteBeer.name, count: stats.favouriteBeer.count })}
          </p>
        ) : null}
      </section>
    </main>
  );
}

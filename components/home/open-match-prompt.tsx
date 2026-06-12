import type { Route } from 'next';
import { useTranslations } from 'next-intl';
import { Beer, Swords } from 'lucide-react';

import { Link } from '@/lib/i18n/navigation';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { avatarUploadUrl } from '@/lib/avatars/upload-url';
import { joinSideNames } from '@/lib/format/match-sides';

// Home prompt for OPEN match agreements the member is a participant
// in. Without this, a scheduled match is invisible on home until the
// member manually navigates to /match — so "record the result" had no
// presence on the main action surface (usability finding 2026-05-28).
// Renders nothing when the member has no open matches.

export interface OpenMatchPlayer {
  memberId: string;
  displayName: string;
  avatarKey: string | null;
  avatarUploadAt: Date | null;
}

export interface OpenMatchSummary {
  id: string;
  forBeer: boolean;
  sideA: OpenMatchPlayer[];
  sideB: OpenMatchPlayer[];
}

// One team: avatar(s) + the joined names. joinSideNames lives in its own
// module so the i18n scanner doesn't trip on the map() arrow here.
function TeamRow({ players }: { players: OpenMatchPlayer[] }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1">
        {players.map((p) => (
          <MemberAvatar
            key={p.memberId}
            size="row"
            avatarKey={p.avatarKey}
            displayName={p.displayName}
            uploadUrl={avatarUploadUrl(p.memberId, p.avatarUploadAt)}
          />
        ))}
      </div>
      <span className="min-w-0 flex-1 text-sm leading-tight font-semibold">
        {joinSideNames(players)}
      </span>
    </div>
  );
}

export function OpenMatchPrompt({ matches }: { matches: OpenMatchSummary[] }) {
  const t = useTranslations('home.openMatch');
  if (matches.length === 0) return null;

  // Single open match → the full versus layout + deep-link straight to it.
  if (matches.length === 1) {
    const m = matches[0]!;
    return (
      <Card className="border-primary/30 flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
            <Swords className="text-primary h-4 w-4" aria-hidden />
            {t('heading')}
          </span>
          {m.forBeer ? (
            <span className="text-primary bg-primary/10 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
              <Beer className="h-3.5 w-3.5" aria-hidden />
              {t('forBeer')}
            </span>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <TeamRow players={m.sideA} />
          <div className="flex items-center gap-2 pl-3.5">
            <span className="text-muted-foreground text-xs font-bold tracking-wider uppercase">
              vs
            </span>
            <span className="bg-border h-px flex-1" />
          </div>
          <TeamRow players={m.sideB} />
        </div>

        <Link
          href={`/match/${m.id}` as Route}
          className={buttonVariants({ className: 'w-full' })}
        >
          {t('recordCta')}
        </Link>
      </Card>
    );
  }

  // Several open matches → aggregate count + link to the hub.
  return (
    <Card className="border-primary/30 flex flex-col gap-3 p-4">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <Swords className="text-primary h-4 w-4 shrink-0" aria-hidden />
        {t('many', { count: matches.length })}
      </p>
      <Link
        href={'/match' as Route}
        className={buttonVariants({ variant: 'outline', className: 'w-full' })}
      >
        {t('goToMatches')}
      </Link>
    </Card>
  );
}

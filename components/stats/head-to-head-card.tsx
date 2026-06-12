import type { Route } from 'next';

import { Link } from '@/lib/i18n/navigation';
import { Card } from '@/components/ui/card';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { avatarUploadUrl } from '@/lib/avatars/upload-url';
import type { MemberFace } from '@/lib/stats/types';

// Spec 034 — a "person stat" card: a caption (Nemesis / Favourite victim /
// Best partner …), the related member's face + name, and the record line.
// Links to that member's profile.
export function StatPersonCard({
  caption,
  memberId,
  face,
  record,
}: {
  caption: string;
  memberId: string;
  face: MemberFace;
  record: string;
}) {
  return (
    <Link href={`/members/${memberId}` as Route} className="block">
      <Card className="hover:bg-accent flex items-center gap-3 p-3 transition-colors">
        <MemberAvatar
          size="row"
          avatarKey={face.avatarKey}
          displayName={face.displayName}
          uploadUrl={avatarUploadUrl(memberId, face.avatarUploadAt)}
        />
        <div className="min-w-0 flex-1">
          <div className="text-muted-foreground text-xs">{caption}</div>
          <div className="truncate text-sm font-semibold">{face.displayName}</div>
        </div>
        <span className="text-primary shrink-0 text-sm font-bold tabular-nums">{record}</span>
      </Card>
    </Link>
  );
}

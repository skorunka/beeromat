'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { MoreVertical, Shield, UserX } from 'lucide-react';

import {
  changeMemberRoleAction,
  setMemberActiveAction,
} from '@/app/[locale]/(app)/admin/members/actions';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ROLES, type Role } from '@/lib/permissions';

// Per-row actions kebab menu on /admin/members. club_admin only;
// the page hides this component for non-admins. Server actions
// re-check role + reject self-modifications.

interface MemberActionsMenuProps {
  memberId: string;
  memberDisplayName: string;
  currentRole: Role;
  isActive: boolean;
  /** Hide self-actions in the UI — the server also rejects them. */
  isSelf: boolean;
}

export function MemberActionsMenu({
  memberId,
  memberDisplayName,
  currentRole,
  isActive,
  isSelf,
}: MemberActionsMenuProps) {
  const t = useTranslations('admin.memberActions');
  const tRoles = useTranslations('admin.roles');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [optimisticRole, setOptimisticRole] = useState<Role>(currentRole);

  if (isSelf) return null;

  function handleRoleChange(nextRole: Role) {
    if (nextRole === optimisticRole || isPending) return;
    const previousRole = optimisticRole;
    setOptimisticRole(nextRole);
    startTransition(async () => {
      const result = await changeMemberRoleAction({ memberId, role: nextRole });
      if (!result.ok) {
        setOptimisticRole(previousRole);
        toast.error(result.code === 'CANT_SELF_MODIFY' ? t('errorSelf') : t('errorGeneric'));
        return;
      }
      toast.success(t('saved'));
      router.refresh();
    });
  }

  function handleToggleActive() {
    const nextActive = !isActive;
    const confirmKey = nextActive ? 'activateConfirm' : 'deactivateConfirm';
    if (!window.confirm(t(confirmKey, { name: memberDisplayName }))) return;
    startTransition(async () => {
      const result = await setMemberActiveAction({ memberId, isActive: nextActive });
      if (!result.ok) {
        toast.error(result.code === 'CANT_SELF_MODIFY' ? t('errorSelf') : t('errorGeneric'));
        return;
      }
      toast.success(t('saved'));
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('open')}
        disabled={isPending}
        className="hover:bg-accent inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors disabled:opacity-50"
      >
        <MoreVertical className="h-4 w-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={4} className="min-w-48">
        {/* Plain div — NOT DropdownMenuLabel (that one is a
            GroupLabel and errors when rendered outside a Group
            context). */}
        <div className="text-muted-foreground flex items-center gap-1.5 px-1.5 py-1 text-xs font-medium">
          <Shield aria-hidden />
          {t('changeRole')}
        </div>
        <DropdownMenuRadioGroup
          value={optimisticRole}
          onValueChange={(v) => handleRoleChange(v as Role)}
        >
          {ROLES.map((r) => (
            <DropdownMenuRadioItem key={r} value={r} disabled={isPending}>
              {tRoles(r)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleToggleActive}
          disabled={isPending}
          variant={isActive ? 'destructive' : 'default'}
        >
          <UserX aria-hidden />
          {isActive ? t('deactivate') : t('activate')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

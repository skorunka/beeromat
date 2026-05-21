'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { inviteMemberAction } from '@/app/[locale]/(app)/admin/members/actions';

const ROLES = ['member', 'stock_manager', 'treasurer', 'club_admin'] as const;
type Role = (typeof ROLES)[number];

export function InviteForm() {
  const t = useTranslations('admin');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await inviteMemberAction({ email, role });
      if (result.ok) {
        toast.success(t('invitationSent', { email }));
        setEmail('');
      } else if (result.code === 'ALREADY_MEMBER') {
        toast.error(t('alreadyMember'));
      } else if (result.code === 'ALREADY_INVITED') {
        toast.error(t('alreadyInvited'));
      } else {
        toast.error(t('inviteFailed'));
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex flex-1 flex-col gap-2">
        <Label htmlFor="invite-email">{t('emailLabel')}</Label>
        <Input
          id="invite-email"
          type="email"
          autoComplete="off"
          placeholder={t('emailPlaceholder')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="invite-role">{t('roleLabel')}</Label>
        <DropdownMenu>
          <DropdownMenuTrigger
            id="invite-role"
            className="border-input bg-background hover:bg-accent inline-flex h-11 min-w-32 items-center justify-start rounded-md border px-3 text-sm"
          >
            {role}
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {ROLES.map((r) => (
              <DropdownMenuItem key={r} onClick={() => setRole(r)}>
                {r}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Button type="submit" className="h-11" disabled={!email || isPending}>
        {isPending ? t('sending') : t('sendInvitation')}
      </Button>
    </form>
  );
}

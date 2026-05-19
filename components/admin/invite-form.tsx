'use client';

import { useState, useTransition } from 'react';
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
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await inviteMemberAction({ email, role });
      if (result.ok) {
        toast.success(`Invitation sent to ${email}`);
        setEmail('');
      } else if (result.code === 'ALREADY_MEMBER') {
        toast.error('That email is already a member.');
      } else if (result.code === 'ALREADY_INVITED') {
        toast.error('There is already an open invitation for that email.');
      } else {
        toast.error('Could not send invitation. Try again.');
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex flex-1 flex-col gap-2">
        <Label htmlFor="invite-email">Email</Label>
        <Input
          id="invite-email"
          type="email"
          autoComplete="off"
          placeholder="new@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="invite-role">Role</Label>
        <DropdownMenu>
          <DropdownMenuTrigger
            id="invite-role"
            className="border-input bg-background hover:bg-accent inline-flex h-9 min-w-32 items-center justify-start rounded-md border px-3 text-sm"
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
      <Button type="submit" disabled={!email || isPending}>
        {isPending ? 'Sending…' : 'Send invitation'}
      </Button>
    </form>
  );
}

'use client';

import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormRootError,
} from '@/components/ui/form';
import { inviteMemberAction } from '@/app/[locale]/(app)/admin/members/actions';
import { inviteMemberSchema, MEMBER_ROLES, type InviteMemberValues } from '@/lib/validation/members';

export function InviteForm() {
  const t = useTranslations('admin');
  const tRoles = useTranslations('admin.roles');
  const [isPending, startTransition] = useTransition();

  const form = useForm<InviteMemberValues>({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: { email: '', role: 'member' },
  });

  function onSubmit(values: InviteMemberValues) {
    startTransition(async () => {
      const result = await inviteMemberAction({ email: values.email, role: values.role });
      if (result.ok) {
        toast.success(t('invitationSent', { email: values.email }));
        form.reset({ email: '', role: values.role });
      } else if (result.code === 'ALREADY_MEMBER') {
        form.setError('email', { message: 'admin.alreadyMember' });
      } else if (result.code === 'ALREADY_INVITED') {
        form.setError('email', { message: 'admin.alreadyInvited' });
      } else {
        form.setError('root', { message: 'admin.inviteFailed' });
      }
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        {/* Row 1: e-mail (takes most of the width) + role on the
            same line. Role gets just enough width for its longest
            label ("Pokladník") — email gets the rest. */}
        <div className="flex items-start gap-3">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormLabel>{t('emailLabel')}</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    autoComplete="off"
                    placeholder={t('emailPlaceholder')}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="role"
            render={({ field }) => (
              <FormItem className="shrink-0">
                <FormLabel>{t('roleLabel')}</FormLabel>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    id={field.name}
                    className="border-input bg-background hover:bg-accent inline-flex h-11 w-36 items-center justify-start rounded-md border px-3 text-sm"
                  >
                    {tRoles(field.value)}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {MEMBER_ROLES.map((r) => (
                      <DropdownMenuItem key={r} onClick={() => field.onChange(r)}>
                        {tRoles(r)}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </FormItem>
            )}
          />
        </div>

        {/* Row 2: full-width submit button so it's prominent + the
            target on a phone is wide enough for one-thumb tap. */}
        <Button
          type="submit"
          className="h-11 w-full"
          disabled={isPending}
          isPending={isPending}
        >
          {isPending ? t('sending') : t('sendInvitation')}
        </Button>
        <FormRootError />
      </form>
    </Form>
  );
}

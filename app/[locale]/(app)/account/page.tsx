import { getTranslations, setRequestLocale } from 'next-intl/server';
import { eq } from 'drizzle-orm';

import { AccountForm } from './AccountForm';
import { AvatarPicker } from '@/components/account/avatar-picker';
import { Card } from '@/components/ui/card';
import { ChangePinForm } from '@/components/account/change-pin-form';
import { SignOutAllButton } from '@/components/account/sign-out-all-button';
import { SignOutButton } from '@/components/account/sign-out-button';
import { requireUnlocked } from '@/lib/auth/session';
import { avatarUploadUrl } from '@/lib/avatars/upload-url';
import { db } from '@/lib/db/client';
import { avatarUploads } from '@/lib/db/schema/avatar-uploads';

// Spec 010 — the member account page.
//
// Augments the v1.3 account hub with an editable display name (the
// page's primary action), plus three stub rows (email, PIN, sign-out-
// all) that signal where future specs slot in. The existing payment-
// history link + single-device sign-out card stay below, unchanged.

export default async function AccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const ctx = await requireUnlocked();
  const t = await getTranslations('account');
  // Spec 021 — pull the stored-upload row so the picker can show
  // the photo on the Upload tile even when a glyph is currently
  // active (lets members switch back without re-uploading).
  const storedUpload = await db.query.avatarUploads.findFirst({
    where: eq(avatarUploads.memberId, ctx.member.id),
    columns: { updatedAt: true },
  });
  const storedUploadUrl = storedUpload
    ? avatarUploadUrl(ctx.member.id, storedUpload.updatedAt)
    : null;

  return (
    <main className="mx-auto max-w-md p-5">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        {/* Email shown as identity subtitle — read-only, visible at
            a glance. Not editable: members are identified by the
            address that received their original magic link. */}
        <p className="text-muted-foreground mt-1 text-sm break-all">{ctx.user.email}</p>
      </header>

      <section className="mb-6">
        <Card className="p-4">
          <AccountForm initialDisplayName={ctx.member.displayName} />
        </Card>
      </section>

      {/* Spec 020 — fun avatar picker. */}
      <section className="mb-6">
        <Card className="p-4">
          <AvatarPicker
            currentKey={ctx.member.avatarKey ?? null}
            activeUploadUrl={avatarUploadUrl(ctx.member.id, ctx.member.avatarUploadAt)}
            storedUploadUrl={storedUploadUrl}
          />
        </Card>
      </section>

      {/* PIN change + sign-out-everywhere. Both rows own their
          internal closed/open layouts (the ChangePinForm and
          SignOutAllButton components). */}
      <section className="mb-6">
        <Card className="flex flex-col divide-y p-0">
          <div className="px-4 py-3">
            <ChangePinForm />
          </div>
          <div className="flex min-h-12 items-center justify-between gap-3 px-4 py-3">
            <div className="flex flex-col">
              <span className="text-sm font-medium">{t('signOutAllLabel')}</span>
              <span className="text-muted-foreground text-xs">{t('signOutAllHint')}</span>
            </div>
            <SignOutAllButton />
          </div>
        </Card>
      </section>

      {/* Single-device sign-out — destructive CTA at the bottom of
          the page. Payment-history link was here too but moved out
          (overlapped with the bottom-nav History tab). */}
      <SignOutButton />
    </main>
  );
}

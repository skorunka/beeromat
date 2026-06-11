import { getTranslations, setRequestLocale } from 'next-intl/server';
import { eq } from 'drizzle-orm';
import { ChevronRight, Receipt } from 'lucide-react';

import { AccountForm } from './AccountForm';
import { AvatarPicker } from '@/components/account/avatar-picker';
import { Card } from '@/components/ui/card';
import { ChangePinForm } from '@/components/account/change-pin-form';
import { SignOutAllButton } from '@/components/account/sign-out-all-button';
import { SignOutButton } from '@/components/account/sign-out-button';
import { Link } from '@/lib/i18n/navigation';
import { requireUnlocked } from '@/lib/auth/session';
import { avatarUploadUrl } from '@/lib/avatars/upload-url';
import { db } from '@/lib/db/client';
import { avatarUploads } from '@/lib/db/schema/avatar-uploads';

// Spec 010 — the member account page.
//
// Augments the v1.3 account hub with an editable display name (the
// page's primary action), plus PIN change + sign-out-all rows. The
// payment-history link and single-device sign-out card sit below.

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

      {/* PIN change + sign-out-everywhere. Both components own
          their full closed/open layouts internally (label + button
          when closed, title + form when open). */}
      <section className="mb-6">
        <Card className="flex flex-col divide-y p-0">
          <div className="px-4 py-3">
            <ChangePinForm />
          </div>
          <div className="px-4 py-3">
            <SignOutAllButton />
          </div>
        </Card>
      </section>

      {/* Payment history — the member's own timeline of money paid
          (incl. confirmed). Distinct from the bottom-nav History tab,
          which lists beer sessions, not payments. */}
      <section className="mb-6">
        <Card className="p-0">
          <Link
            href="/account/payments"
            className="hover:bg-muted/50 flex items-center justify-between gap-3 rounded-[inherit] px-4 py-3.5 transition-colors"
          >
            <span className="flex items-center gap-2.5 font-medium">
              <Receipt className="text-muted-foreground h-5 w-5" aria-hidden />
              {t('paymentHistory')}
            </span>
            <ChevronRight className="text-muted-foreground h-4 w-4" aria-hidden />
          </Link>
        </Card>
      </section>

      {/* Single-device sign-out — destructive CTA at the bottom. */}
      <SignOutButton />
    </main>
  );
}

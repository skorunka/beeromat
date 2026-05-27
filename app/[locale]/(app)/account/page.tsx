import { getTranslations, setRequestLocale } from 'next-intl/server';

import { AccountForm } from './AccountForm';
import { AvatarPicker } from '@/components/account/avatar-picker';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ChangePinForm } from '@/components/account/change-pin-form';
import { SignOutAllButton } from '@/components/account/sign-out-all-button';
import { SignOutButton } from '@/components/account/sign-out-button';
import { Link } from '@/lib/i18n/navigation';
import { requireUnlocked } from '@/lib/auth/session';
import { avatarUploadUrl } from '@/lib/avatars/upload-url';

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

  return (
    <main className="mx-auto max-w-md p-5">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('subtitle')}</p>
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
            uploadUrl={avatarUploadUrl(ctx.member.id, ctx.member.avatarUploadAt)}
          />
        </Card>
      </section>

      {/* Account-management rows. Email change is still a stub (its
          own spec — needs a verification flow); PIN change and sign-
          out-everywhere are live since 2026-05-27. */}
      <section className="mb-6">
        <Card className="flex flex-col divide-y p-0">
          <div className="flex min-h-12 items-center justify-between gap-3 px-4 py-3">
            <div className="flex flex-col">
              <span className="text-sm font-medium">{t('emailLabel')}</span>
              <span className="text-muted-foreground text-xs break-all">{ctx.user.email}</span>
            </div>
            <Badge variant="outline">{t('laterBadge')}</Badge>
          </div>
          <div className="flex flex-col gap-2 px-4 py-3">
            <div className="flex min-h-12 items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-sm font-medium">{t('pinLabel')}</span>
                <span className="text-muted-foreground text-xs">{t('pinValue')}</span>
              </div>
              <ChangePinForm />
            </div>
          </div>
          <div className="flex flex-col gap-2 px-4 py-3">
            <div className="flex min-h-12 items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-sm font-medium">{t('signOutAllLabel')}</span>
                <span className="text-muted-foreground text-xs">{t('signOutAllHint')}</span>
              </div>
              <SignOutAllButton />
            </div>
          </div>
        </Card>
      </section>

      {/* Existing v1.3 controls — unchanged. */}
      <Card className="flex flex-col divide-y p-0">
        <Link
          href="/account/payments"
          className="flex min-h-12 items-center px-4 py-3 text-sm font-medium"
        >
          {t('paymentHistory')}
        </Link>
        <SignOutButton />
      </Card>
    </main>
  );
}

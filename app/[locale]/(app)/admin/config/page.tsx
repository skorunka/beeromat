import type { Route } from 'next';
import { Link } from '@/lib/i18n/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { BankingForm } from '@/components/admin/banking-form';
import { Card } from '@/components/ui/card';
import { requireRole } from '@/lib/auth/session';
import { getClubConfigWithBanking } from '@/lib/db/queries/club-config';

import { ClubConfigForm } from './ClubConfigForm';

// Spec 008 — /admin/config server component.
//
// Loads the single clubs row + its optional banking profile in one
// helper call, then renders TWO forms: ClubConfigForm (the new v1.8
// club-fields editor) and BankingForm (the existing v1 banking-profile
// editor, reused). The split keeps each form's submit isolated — the
// admin can save banking without re-confirming a currency change and
// vice versa.

export default async function AdminConfigPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const ctx = await requireRole('club_admin');
  const t = await getTranslations('admin.clubConfig');
  const tAdmin = await getTranslations('admin');
  const tCommon = await getTranslations('common');

  const snapshot = await getClubConfigWithBanking(ctx.club.id);
  if (!snapshot) {
    throw new Error(`admin/config: no clubs row found for club id ${ctx.club.id}`);
  }
  const { config, banking } = snapshot;

  return (
    <main className="mx-auto max-w-md p-5">
      <Link
        href={'/admin' as Route}
        className="text-muted-foreground hover:text-foreground mb-4 inline-block text-sm underline"
      >
        ← {tCommon('back')}
      </Link>
      <header className="mb-4">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground text-sm">{t('subtitle')}</p>
      </header>

      <section className="mb-6">
        <Card className="p-4">
          <ClubConfigForm
            defaults={{
              name: config.name,
              currencyCode: config.currencyCode,
              defaultLocale: config.defaultLocale,
            }}
          />
        </Card>
      </section>

      <section className="mb-6">
        <header className="mb-3">
          <h2 className="text-lg font-semibold">{tAdmin('bankingTitle')}</h2>
          <p className="text-muted-foreground text-sm">{tAdmin('bankingSubtitle')}</p>
        </header>
        <Card className="p-4">
          <BankingForm
            initial={{
              iban: banking?.iban ?? null,
              accountHolderName: banking?.accountHolderName ?? null,
              revolutHandle: banking?.revolutHandle ?? null,
              defaultQrMessage: banking?.defaultQrMessage ?? null,
            }}
          />
        </Card>
      </section>

    </main>
  );
}

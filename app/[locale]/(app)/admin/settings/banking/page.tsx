import type { Route } from 'next';
import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { setRequestLocale } from 'next-intl/server';

import { BankingForm } from '@/components/admin/banking-form';
import { Card } from '@/components/ui/card';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { clubBankingProfiles } from '@/lib/db/schema/clubs';

export default async function BankingSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const ctx = await requireRole('club_admin');
  const profile = await db.query.clubBankingProfiles.findFirst({
    where: eq(clubBankingProfiles.clubId, ctx.club.id),
  });

  return (
    <main className="mx-auto max-w-md p-4">
      <header className="mb-4">
        <h1 className="text-xl font-semibold">Banking profile</h1>
        <p className="text-muted-foreground text-sm">
          Bank details used to generate members&apos; payment QR codes.
        </p>
      </header>

      <Card className="p-4">
        <BankingForm
          initial={{
            iban: profile?.iban ?? null,
            accountHolderName: profile?.accountHolderName ?? null,
            revolutHandle: profile?.revolutHandle ?? null,
            defaultQrMessage: profile?.defaultQrMessage ?? null,
          }}
        />
      </Card>

      <Link href={'/' as Route} className="text-primary mt-4 inline-block text-sm underline">
        Back home
      </Link>
    </main>
  );
}

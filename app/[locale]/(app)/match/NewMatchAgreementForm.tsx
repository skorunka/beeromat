'use client';

import { useTransition } from 'react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { createAgreementAction } from '@/app/[locale]/(app)/match/actions';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  createAgreementSchema,
  type CreateAgreementInput,
} from '@/lib/validation/match-agreement';

interface MemberOption {
  id: string;
  displayName: string;
}

interface NewMatchAgreementFormProps {
  members: MemberOption[];
}

type FormValues = {
  format: 'singles' | 'doubles';
  forBeer: boolean;
  a1: string;
  a2: string;
  b1: string;
  b2: string;
  pairingKind: 'straight' | 'crossed' | '';
};

function buildInput(values: FormValues): CreateAgreementInput {
  if (values.format === 'singles') {
    return {
      format: 'singles',
      forBeer: values.forBeer,
      sides: { A: { seat1: values.a1 }, B: { seat1: values.b1 } },
    };
  }
  return {
    format: 'doubles',
    forBeer: values.forBeer,
    sides: {
      A: { seat1: values.a1, seat2: values.a2 },
      B: { seat1: values.b1, seat2: values.b2 },
    },
    // pairingKind is required for doubles; UI validation ensures non-empty.
    pairingKind: (values.pairingKind || 'straight') as 'straight' | 'crossed',
  };
}

export function NewMatchAgreementForm({ members }: NewMatchAgreementFormProps) {
  const t = useTranslations('match');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    defaultValues: {
      format: 'doubles', // FR-002
      forBeer: true,
      a1: '',
      a2: '',
      b1: '',
      b2: '',
      pairingKind: '', // FR-006 + Q4: no implicit default
    },
  });
  // Use `useWatch` (subscription-based) instead of `form.watch()` —
  // the latter trips the react-hooks/incompatible-library lint rule
  // because its returned values can't be memoised safely.
  const format = useWatch({ control: form.control, name: 'format' });
  const pairingKind = useWatch({ control: form.control, name: 'pairingKind' });

  function onSubmit(values: FormValues) {
    // Client-side validation: pairing required for doubles (Q4 — no default).
    if (values.format === 'doubles' && !values.pairingKind) {
      form.setError('pairingKind', { message: 'match.errors.pairingRequired' });
      return;
    }
    // Validate the full shape through the same Zod schema the server uses.
    const input = buildInput(values);
    const parsed = createAgreementSchema.safeParse(input);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        toast.error(t.has(issue.message) ? t(issue.message) : t('errors.generic'));
      }
      return;
    }

    startTransition(async () => {
      const result = await createAgreementAction(parsed.data);
      if (!result.ok) {
        if (result.code === 'DUPLICATE_MEMBER') {
          toast.error(t('errors.duplicateMember'));
        } else if (result.code === 'MEMBER_NOT_IN_CLUB') {
          toast.error(t('errors.memberNotInClub'));
        } else if (result.code === 'VALIDATION_FAILED') {
          for (const [, msgs] of Object.entries(result.fieldErrors)) {
            if (msgs[0]) toast.error(t.has(msgs[0]) ? t(msgs[0]) : t('errors.generic'));
          }
        }
        return;
      }
      toast.success(t('agreementCreatedToast'));
      router.push(`/match/${result.agreementId}` as Route);
      router.refresh();
    });
  }

  if (members.length < 2) {
    return <p className="text-muted-foreground p-4 text-sm">{t('noOpponents')}</p>;
  }

  const memberOptions = members.map((m) => (
    <option key={m.id} value={m.id}>
      {m.displayName}
    </option>
  ));

  return (
    <Form {...form}>
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
        {/* Format toggle */}
        <FormField
          control={form.control}
          name="format"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('formatLabel')}</FormLabel>
              <FormControl>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={field.value === 'doubles' ? 'default' : 'outline'}
                    onClick={() => field.onChange('doubles')}
                    className="h-12"
                  >
                    {t('formatDoubles')}
                  </Button>
                  <Button
                    type="button"
                    variant={field.value === 'singles' ? 'default' : 'outline'}
                    onClick={() => field.onChange('singles')}
                    className="h-12"
                  >
                    {t('formatSingles')}
                  </Button>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Lineup */}
        <div className="border-border flex flex-col gap-3 rounded-md border p-3">
          <p className="text-sm font-semibold">{t('sideALabel')}</p>
          <FormField
            control={form.control}
            name="a1"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="sr-only">{t('seat1Label')}</FormLabel>
                <FormControl>
                  <select
                    {...field}
                    className="border-input bg-background hover:bg-accent inline-flex h-12 w-full items-center rounded-md border px-3 text-base"
                  >
                    <option value="">{t('pickMember')}</option>
                    {memberOptions}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {format === 'doubles' ? (
            <FormField
              control={form.control}
              name="a2"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="sr-only">{t('seat2Label')}</FormLabel>
                  <FormControl>
                    <select
                      {...field}
                      className="border-input bg-background hover:bg-accent inline-flex h-12 w-full items-center rounded-md border px-3 text-base"
                    >
                      <option value="">{t('pickMember')}</option>
                      {memberOptions}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : null}
        </div>

        <div className="border-border flex flex-col gap-3 rounded-md border p-3">
          <p className="text-sm font-semibold">{t('sideBLabel')}</p>
          <FormField
            control={form.control}
            name="b1"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="sr-only">{t('seat1Label')}</FormLabel>
                <FormControl>
                  <select
                    {...field}
                    className="border-input bg-background hover:bg-accent inline-flex h-12 w-full items-center rounded-md border px-3 text-base"
                  >
                    <option value="">{t('pickMember')}</option>
                    {memberOptions}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {format === 'doubles' ? (
            <FormField
              control={form.control}
              name="b2"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="sr-only">{t('seat2Label')}</FormLabel>
                  <FormControl>
                    <select
                      {...field}
                      className="border-input bg-background hover:bg-accent inline-flex h-12 w-full items-center rounded-md border px-3 text-base"
                    >
                      <option value="">{t('pickMember')}</option>
                      {memberOptions}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : null}
        </div>

        {/* For-beer toggle */}
        <FormField
          control={form.control}
          name="forBeer"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('forBeerLabel')}</FormLabel>
              <FormControl>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={field.value === true ? 'default' : 'outline'}
                    onClick={() => field.onChange(true)}
                    className="h-12"
                  >
                    {t('forBeerYes')}
                  </Button>
                  <Button
                    type="button"
                    variant={field.value === false ? 'default' : 'outline'}
                    onClick={() => field.onChange(false)}
                    className="h-12"
                  >
                    {t('forBeerNo')}
                  </Button>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Pairing — doubles only, EXPLICIT pick (FR-006 / Q4 — no default) */}
        {format === 'doubles' ? (
          <FormField
            control={form.control}
            name="pairingKind"
            render={({ field, fieldState }) => (
              <FormItem>
                <FormLabel>{t('pairingLabel')}</FormLabel>
                <p className="text-muted-foreground text-xs">{t('pairingHint')}</p>
                <FormControl>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={field.value === 'straight' ? 'default' : 'outline'}
                      onClick={() => field.onChange('straight')}
                      className="h-14 flex-col text-xs leading-tight"
                    >
                      <span className="text-sm font-semibold">{t('pairingStraight')}</span>
                      <span className="text-muted-foreground">A1↔B1, A2↔B2</span>
                    </Button>
                    <Button
                      type="button"
                      variant={field.value === 'crossed' ? 'default' : 'outline'}
                      onClick={() => field.onChange('crossed')}
                      className="h-14 flex-col text-xs leading-tight"
                    >
                      <span className="text-sm font-semibold">{t('pairingCrossed')}</span>
                      <span className="text-muted-foreground">A1↔B2, A2↔B1</span>
                    </Button>
                  </div>
                </FormControl>
                {fieldState.error?.message ? (
                  <p className="text-destructive text-sm">
                    {t.has(fieldState.error.message)
                      ? t(fieldState.error.message)
                      : t('errors.generic')}
                  </p>
                ) : null}
              </FormItem>
            )}
          />
        ) : null}

        <Button
          type="submit"
          size="lg"
          disabled={isPending || (format === 'doubles' && !pairingKind)}
          isPending={isPending}
          className="h-14 text-base"
        >
          {isPending ? t('creating') : t('createCta')}
        </Button>
      </form>
    </Form>
  );
}

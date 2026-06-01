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
import { MemberPickerDropdown } from '@/components/picker/member-picker-dropdown';
import type { MemberOption } from '@/components/picker/types';
import {
  createAgreementSchema,
  type CreateAgreementInput,
} from '@/lib/validation/match-agreement';

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
      // FR-006 + Q4 originally said "no implicit default"; user
      // override 2026-05-30 — straight is the common case, pre-select
      // it so creating a doubles match is one fewer tap. Members can
      // still flip to "crossed" before submitting.
      pairingKind: 'straight',
    },
  });
  // Use `useWatch` (subscription-based) instead of `form.watch()` —
  // the latter trips the react-hooks/incompatible-library lint rule
  // because its returned values can't be memoised safely.
  const format = useWatch({ control: form.control, name: 'format' });
  const pairingKind = useWatch({ control: form.control, name: 'pairingKind' });
  // Spec 024 — subscribe to each seat field so the disable-set
  // recomputes when any pick changes.
  const seatA1 = useWatch({ control: form.control, name: 'a1' });
  const seatA2 = useWatch({ control: form.control, name: 'a2' });
  const seatB1 = useWatch({ control: form.control, name: 'b1' });
  const seatB2 = useWatch({ control: form.control, name: 'b2' });

  function onSubmit(values: FormValues) {
    // Client-side validation: pairing required for doubles (Q4 — no default).
    if (values.format === 'doubles' && !values.pairingKind) {
      form.setError('pairingKind', { message: 'match.errors.pairingRequired' });
      return;
    }
    // Validate the full shape through the same Zod schema the server uses.
    // Note: the submit button itself is gated on every required seat
    // being filled (see `canSubmit` below) so this path should not
    // normally fire — but it stays as defence-in-depth. Coalesce the
    // toast to ONE message rather than one per Zod issue (the previous
    // per-issue loop spammed three toasts on an empty doubles form).
    const input = buildInput(values);
    const parsed = createAgreementSchema.safeParse(input);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const msg = first && t.has(first.message) ? t(first.message) : t('errors.generic');
      toast.error(msg);
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

  // Spec 024 — disable members already assigned to OTHER seats
  // in this agreement so the user can't accidentally double-book
  // someone. Only the seats VISIBLE in the current format count;
  // a2/b2 still hold their last doubles values in the form state
  // after switching to singles, but those phantom values mustn't
  // affect the disable-set for the visible singles pickers.
  // Each picker's own current value is also excluded from the
  // disable effect inside <MemberPickerDropdown />.
  const activeSeats = format === 'doubles'
    ? [seatA1, seatA2, seatB1, seatB2]
    : [seatA1, seatB1];
  const assignedIds = new Set(activeSeats.filter(Boolean) as string[]);

  return (
    <Form {...form}>
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
        {/* Lock the whole setup form while the create action is in
            flight (prevents edits / double-submit mid-request). A
            native disabled fieldset cascades to every descendant
            control — the toggles, the seat-picker triggers, and the
            submit button are all native <button>s. `contents` keeps
            the flex layout intact. */}
        <fieldset disabled={isPending} className="contents">
        {/* Format toggle */}
        <FormField
          control={form.control}
          name="format"
          render={({ field }) => (
            <FormItem>
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
                  <MemberPickerDropdown
                    members={members}
                    value={field.value || null}
                    onChange={(id) => field.onChange(id ?? '')}
                    disabledIds={assignedIds}
                    placeholder={t('pickMember')}
                    ariaLabel={t('seat1Label')}
                  />
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
                    <MemberPickerDropdown
                      members={members}
                      value={field.value || null}
                      onChange={(id) => field.onChange(id ?? '')}
                      disabledIds={assignedIds}
                      placeholder={t('pickMember')}
                      ariaLabel={t('seat2Label')}
                    />
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
                  <MemberPickerDropdown
                    members={members}
                    value={field.value || null}
                    onChange={(id) => field.onChange(id ?? '')}
                    disabledIds={assignedIds}
                    placeholder={t('pickMember')}
                    ariaLabel={t('seat1Label')}
                  />
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
                    <MemberPickerDropdown
                      members={members}
                      value={field.value || null}
                      onChange={(id) => field.onChange(id ?? '')}
                      disabledIds={assignedIds}
                      placeholder={t('pickMember')}
                      ariaLabel={t('seat2Label')}
                    />
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
                      {/* Subtitle contrast: muted-foreground is grey on
                          the amber primary fill and disappears. Use a
                          translucent primary-foreground when selected so
                          it stays readable on the amber background. */}
                      <span
                        className={
                          field.value === 'straight'
                            ? 'text-primary-foreground/80'
                            : 'text-muted-foreground'
                        }
                      >
                        A1↔B1, A2↔B2
                      </span>
                    </Button>
                    <Button
                      type="button"
                      variant={field.value === 'crossed' ? 'default' : 'outline'}
                      onClick={() => field.onChange('crossed')}
                      className="h-14 flex-col text-xs leading-tight"
                    >
                      <span className="text-sm font-semibold">{t('pairingCrossed')}</span>
                      <span
                        className={
                          field.value === 'crossed'
                            ? 'text-primary-foreground/80'
                            : 'text-muted-foreground'
                        }
                      >
                        A1↔B2, A2↔B1
                      </span>
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
          disabled={
            isPending ||
            !seatA1 ||
            !seatB1 ||
            (format === 'doubles' && (!seatA2 || !seatB2 || !pairingKind))
          }
          isPending={isPending}
          className="h-14 text-base"
        >
          {isPending ? t('creating') : t('createCta')}
        </Button>
        </fieldset>
      </form>
    </Form>
  );
}

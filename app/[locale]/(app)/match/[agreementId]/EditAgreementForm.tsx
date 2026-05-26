'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import {
  cancelAgreementAction,
  editAgreementAction,
} from '@/app/[locale]/(app)/match/actions';
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

interface EditAgreementFormProps {
  agreementId: string;
  members: MemberOption[];
  initial: {
    format: 'singles' | 'doubles';
    forBeer: boolean;
    pairingKind: 'straight' | 'crossed' | null;
    a1: string;
    a2: string | null;
    b1: string;
    b2: string | null;
  };
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
    pairingKind: (values.pairingKind || 'straight') as 'straight' | 'crossed',
  };
}

export function EditAgreementForm({ agreementId, members, initial }: EditAgreementFormProps) {
  const t = useTranslations('match');
  const router = useRouter();
  const [isSaving, startSave] = useTransition();
  const [isCancelling, startCancel] = useTransition();

  const form = useForm<FormValues>({
    defaultValues: {
      format: initial.format,
      forBeer: initial.forBeer,
      a1: initial.a1,
      a2: initial.a2 ?? '',
      b1: initial.b1,
      b2: initial.b2 ?? '',
      pairingKind: initial.pairingKind ?? '',
    },
  });
  // Use `useWatch` instead of `form.watch()` — the latter trips the
  // react-hooks/incompatible-library lint rule.
  const format = useWatch({ control: form.control, name: 'format' });

  function onSave(values: FormValues) {
    if (values.format === 'doubles' && !values.pairingKind) {
      form.setError('pairingKind', { message: 'match.errors.pairingRequired' });
      return;
    }
    const input = buildInput(values);
    const parsed = createAgreementSchema.safeParse(input);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        toast.error(t.has(issue.message) ? t(issue.message) : t('errors.generic'));
      }
      return;
    }
    startSave(async () => {
      const result = await editAgreementAction({ agreementId, patch: parsed.data });
      if (!result.ok) {
        if (result.code === 'NOT_EDITABLE') toast.error(t('errors.notEditable'));
        else if (result.code === 'DUPLICATE_MEMBER') toast.error(t('errors.duplicateMember'));
        else if (result.code === 'MEMBER_NOT_IN_CLUB') toast.error(t('errors.memberNotInClub'));
        else toast.error(t('errors.generic'));
        return;
      }
      toast.success(t('editSavedToast'));
      router.refresh();
    });
  }

  function onCancel() {
    if (!window.confirm(t('cancelConfirm'))) return;
    startCancel(async () => {
      const result = await cancelAgreementAction({ agreementId });
      if (!result.ok) {
        if (result.code === 'NOT_CANCELLABLE') toast.error(t('errors.notCancellable'));
        else toast.error(t('errors.generic'));
        return;
      }
      toast.success(t('cancelledToast'));
      router.push('/match');
      router.refresh();
    });
  }

  const memberOptions = members.map((m) => (
    <option key={m.id} value={m.id}>
      {m.displayName}
    </option>
  ));

  return (
    <Form {...form}>
      <form noValidate onSubmit={form.handleSubmit(onSave)} className="flex flex-col gap-4">
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
                    className="h-11"
                  >
                    {t('formatDoubles')}
                  </Button>
                  <Button
                    type="button"
                    variant={field.value === 'singles' ? 'default' : 'outline'}
                    onClick={() => field.onChange('singles')}
                    className="h-11"
                  >
                    {t('formatSingles')}
                  </Button>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="border-border flex flex-col gap-3 rounded-md border p-3">
          <p className="text-sm font-semibold">{t('sideALabel')}</p>
          <FormField
            control={form.control}
            name="a1"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <select
                    {...field}
                    className="border-input bg-background hover:bg-accent inline-flex h-11 w-full items-center rounded-md border px-3 text-base"
                  >
                    <option value="">{t('pickMember')}</option>
                    {memberOptions}
                  </select>
                </FormControl>
              </FormItem>
            )}
          />
          {format === 'doubles' ? (
            <FormField
              control={form.control}
              name="a2"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <select
                      {...field}
                      className="border-input bg-background hover:bg-accent inline-flex h-11 w-full items-center rounded-md border px-3 text-base"
                    >
                      <option value="">{t('pickMember')}</option>
                      {memberOptions}
                    </select>
                  </FormControl>
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
                <FormControl>
                  <select
                    {...field}
                    className="border-input bg-background hover:bg-accent inline-flex h-11 w-full items-center rounded-md border px-3 text-base"
                  >
                    <option value="">{t('pickMember')}</option>
                    {memberOptions}
                  </select>
                </FormControl>
              </FormItem>
            )}
          />
          {format === 'doubles' ? (
            <FormField
              control={form.control}
              name="b2"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <select
                      {...field}
                      className="border-input bg-background hover:bg-accent inline-flex h-11 w-full items-center rounded-md border px-3 text-base"
                    >
                      <option value="">{t('pickMember')}</option>
                      {memberOptions}
                    </select>
                  </FormControl>
                </FormItem>
              )}
            />
          ) : null}
        </div>

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
                    className="h-11"
                  >
                    {t('forBeerYes')}
                  </Button>
                  <Button
                    type="button"
                    variant={field.value === false ? 'default' : 'outline'}
                    onClick={() => field.onChange(false)}
                    className="h-11"
                  >
                    {t('forBeerNo')}
                  </Button>
                </div>
              </FormControl>
            </FormItem>
          )}
        />

        {format === 'doubles' ? (
          <FormField
            control={form.control}
            name="pairingKind"
            render={({ field, fieldState }) => (
              <FormItem>
                <FormLabel>{t('pairingLabel')}</FormLabel>
                <FormControl>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={field.value === 'straight' ? 'default' : 'outline'}
                      onClick={() => field.onChange('straight')}
                      className="h-12"
                    >
                      {t('pairingStraight')}
                    </Button>
                    <Button
                      type="button"
                      variant={field.value === 'crossed' ? 'default' : 'outline'}
                      onClick={() => field.onChange('crossed')}
                      className="h-12"
                    >
                      {t('pairingCrossed')}
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

        <div className="flex gap-2">
          <Button type="submit" disabled={isSaving} className="flex-1 h-12">
            {isSaving ? t('savingEdit') : t('saveEdit')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isCancelling}
            onClick={onCancel}
            className="h-12"
          >
            {isCancelling ? t('cancelling') : t('cancelMatch')}
          </Button>
        </div>
      </form>
    </Form>
  );
}

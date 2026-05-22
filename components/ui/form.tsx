'use client';

// v1.2 forms hardening — shadcn-style react-hook-form primitives.
//
// Building every form from these primitives is what makes consistent,
// accessible, in-app validation a structural property rather than 11
// hand-built repetitions (contracts/forms.md §1):
//   - FormControl wires id + aria-invalid / aria-describedby onto the input.
//   - FormMessage renders a *catalog key* through next-intl — so a locale
//     switch re-translates a visible error (FR-008) — and carries role=alert.
//   - FormRootError renders form-level (non-field) errors distinctly (FR-012).
//
// The DOM id of a control is its react-hook-form field `name` (e.g. a field
// named `email` gets id="email"). That keeps ids predictable and stable for
// the E2E suite, and keeps the label/control/message wiring coherent. Two
// fields with the same name on one page would collide — the app never mounts
// two such forms simultaneously.

import * as React from 'react';
import {
  Controller,
  FormProvider,
  useFormContext,
  useFormState,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';

/** Provides the react-hook-form context. Wrap every migrated form in this. */
const Form = FormProvider;

interface FormFieldContextValue {
  name: string;
}
const FormFieldContext = React.createContext<FormFieldContextValue | null>(null);

/** Binds one schema field via react-hook-form's Controller. */
function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>(props: ControllerProps<TFieldValues, TName>) {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
}

/** Layout wrapper for one field — label, control, and message stacked. */
function FormItem({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="form-item" className={cn('flex flex-col gap-2', className)} {...props} />
  );
}

/** Field state + the wired-up element ids, derived from the field name. */
function useFormField() {
  const fieldContext = React.useContext(FormFieldContext);
  const { getFieldState } = useFormContext();
  const formState = useFormState({ name: fieldContext?.name });

  if (!fieldContext) {
    throw new Error('useFormField must be used within <FormField>');
  }

  const { name } = fieldContext;
  const fieldState = getFieldState(name, formState);
  return {
    name,
    formItemId: name,
    formDescriptionId: `${name}-description`,
    formMessageId: `${name}-message`,
    ...fieldState,
  };
}

/** <label> bound to the control; turns destructive when the field is invalid. */
function FormLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  const { error, formItemId } = useFormField();
  return (
    <Label
      data-slot="form-label"
      data-error={!!error}
      htmlFor={formItemId}
      className={cn(error && 'text-destructive', className)}
      {...props}
    />
  );
}

/**
 * Wraps the single input child and injects id + aria wiring onto it, so the
 * label points at it and assistive tech reads the error (FR-009). The input's
 * own `aria-invalid:` Tailwind styles then surface the error visually.
 */
function FormControl({ children }: { children: React.ReactElement }) {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField();
  return React.cloneElement(children, {
    id: formItemId,
    'aria-describedby': error
      ? `${formDescriptionId} ${formMessageId}`
      : formDescriptionId,
    'aria-invalid': !!error,
  } as React.HTMLAttributes<HTMLElement>);
}

/** Optional helper / hint text for a field. */
function FormDescription({ className, ...props }: React.ComponentProps<'p'>) {
  const { formDescriptionId } = useFormField();
  return (
    <p
      id={formDescriptionId}
      data-slot="form-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}

/**
 * Renders the field's validation error. The error's `message` is a catalog
 * KEY (schemas never carry literal text) — translated here so it renders in
 * the active locale and re-renders on a locale switch. Renders nothing when
 * the field is valid.
 */
function FormMessage({ className, children, ...props }: React.ComponentProps<'p'>) {
  const { error, formMessageId } = useFormField();
  const t = useTranslations();
  const key = error?.message;
  const body = key ? (t.has(key) ? t(key) : key) : children;
  if (!body) return null;
  return (
    <p
      id={formMessageId}
      role="alert"
      data-slot="form-message"
      className={cn('text-destructive text-sm', className)}
      {...props}
    >
      {body}
    </p>
  );
}

/**
 * Renders a form-level error — a Turnstile failure, a uniqueness conflict, a
 * generic action failure — set via `setError('root', { message: <key> })`.
 * Kept visually and semantically distinct from per-field FormMessage (FR-012).
 */
function FormRootError({ className, children, ...props }: React.ComponentProps<'p'>) {
  const { errors } = useFormState();
  const t = useTranslations();
  const key = errors.root?.message;
  const body = key ? (t.has(key) ? t(key) : key) : children;
  if (!body) return null;
  return (
    <p
      role="alert"
      data-slot="form-root-error"
      className={cn(
        'rounded-lg bg-destructive/10 px-3 py-2 text-destructive text-sm',
        className,
      )}
      {...props}
    >
      {body}
    </p>
  );
}

export {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormRootError,
  useFormField,
};

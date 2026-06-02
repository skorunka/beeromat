'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// App-wide async confirm dialog — the accessible replacement for
// window.confirm (focus trap, ESC, scroll lock, ARIA, themed UI).
// Mount <ConfirmProvider> once (in the (app) layout); call useConfirm()
// anywhere beneath it and `await confirm({...})` returns a boolean.

export interface ConfirmOptions {
  /** Heading — usually the question ("Zrušit tento zápas?"). */
  title: string;
  /** Optional supporting line under the title. */
  description?: string;
  /** Affirmative button label (defaults to common.confirm). */
  confirmLabel?: string;
  /** Dismiss button label (defaults to common.cancel). */
  cancelLabel?: string;
  /** Style the affirmative button as destructive (red). */
  destructive?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    setOptions(opts);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = useCallback((result: boolean) => {
    setOpen(false);
    // Resolve after the state flush so a re-open from the same handler
    // (rare) still gets a fresh promise.
    const resolve = resolverRef.current;
    resolverRef.current = null;
    resolve?.(result);
  }, []);

  // ESC / backdrop / programmatic close all funnel through here — any
  // close that isn't an explicit confirm resolves the promise as false.
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) settle(false);
      else setOpen(true);
    },
    [settle],
  );

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={open} onOpenChange={handleOpenChange}>
        {options ? (
          <DialogContent showCloseButton={false} className="sm:max-w-xs">
            <DialogHeader>
              <DialogTitle>{options.title}</DialogTitle>
              {options.description ? (
                <DialogDescription>{options.description}</DialogDescription>
              ) : null}
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => settle(false)}>
                {options.cancelLabel ?? t('cancel')}
              </Button>
              <Button
                type="button"
                variant={options.destructive ? 'destructive' : 'default'}
                onClick={() => settle(true)}
              >
                {options.confirmLabel ?? t('confirm')}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm must be used within a <ConfirmProvider>');
  }
  return ctx;
}

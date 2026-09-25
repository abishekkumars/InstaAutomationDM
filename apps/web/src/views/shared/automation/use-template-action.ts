'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { TemplateActionResult } from '@/app/templates/actions';

export type TemplateStatus = 'created' | 'updated' | 'default' | 'cloned' | 'deleted' | 'error';

/** Announces a template outcome through the URL-driven ToastHost. `message` replaces the
 * standard text where there is a name to mention. */
export function useTemplateToast() {
  const router = useRouter();
  return (status: TemplateStatus, message?: string) => {
    const params = new URLSearchParams({ template: status });
    if (message) params.set('message', message);
    router.replace(`/templates?${params.toString()}`, { scroll: false });
  };
}

/** Runs a one-click template action (set default, clone, delete) in a transition, so the caller
 * can show the loading overlay while it is in flight. On success it calls `onDone` (closing a
 * sheet or dialog) and toasts `status`. On failure it toasts the reason. The template actions
 * return a result rather than redirecting - see app/templates/actions.ts for why. */
export function useTemplateAction() {
  const [pending, startTransition] = useTransition();
  const toast = useTemplateToast();

  function run(
    action: () => Promise<TemplateActionResult>,
    success: { status: TemplateStatus; message?: string; onDone?: () => void },
  ) {
    startTransition(async () => {
      const result = await action();
      success.onDone?.();
      if (result.ok) {
        toast(success.status, success.message);
      } else {
        toast('error', result.message);
      }
    });
  }

  return { pending, run };
}

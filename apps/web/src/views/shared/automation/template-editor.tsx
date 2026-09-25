'use client';

import { useId, useState, type ReactNode } from 'react';
import { TEMPLATE_LIMITS } from '@automationdm/validation';
import { deleteTemplateAction, saveTemplateAction } from '@/app/templates/actions';
import type { AutomationTemplate } from '@/app/templates/templates-data';
import { FormPendingOverlay, LoadingOverlay } from '@/views/shared/loader';
import {
  AutomationHiddenInputs,
  EMPTY_FIELD_VALUES,
  EnabledField,
  MessageFields,
  TriggerFields,
  templateFieldValues,
  useAutomationFields,
} from './automation-fields';
import { useTemplateAction, useTemplateToast } from './use-template-action';

export type TemplateVariant = 'desktop' | 'mobile';

/** The overlay and panel both dialogs here share: a centred dialog on desktop, a bottom sheet
 * inside the mobile view (`data-variant` switches on the `mobile:` classes - see globals.css).
 * Same shell as the create-automation wizard, so the two read as one family. */
function DialogShell({
  variant,
  label,
  size = 'lg',
  children,
}: {
  variant: TemplateVariant;
  label: string;
  size?: 'lg' | 'sm';
  children: ReactNode;
}) {
  return (
    <div
      data-variant={variant === 'mobile' ? 'mobile' : undefined}
      className="fixed inset-0 z-50 flex h-dvh items-start justify-center overflow-y-auto bg-ink-950/60 p-0 text-left sm:items-center sm:p-6 mobile:items-end mobile:bg-ink-950/45"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`flex w-full flex-col overflow-hidden bg-surface shadow-lg sm:h-auto sm:max-h-[85dvh] sm:rounded-xl sm:border sm:border-border mobile:rounded-t-[28px] mobile:border-t mobile:border-glass-border mobile:shadow-glass ${
          size === 'lg'
            ? 'h-full sm:max-w-lg mobile:h-[92dvh]'
            : 'mt-auto sm:mt-0 sm:max-w-sm mobile:h-auto'
        }`}
      >
        <span
          aria-hidden="true"
          className="mx-auto mt-2.5 hidden h-[5px] w-10 shrink-0 rounded-full bg-switch-off mobile:block"
        />
        {children}
      </div>
    </div>
  );
}

function DialogHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-4 py-3 mobile:px-5 mobile:pt-2 mobile:pb-4">
      <h2 className="flex-1 text-sm font-semibold text-text mobile:text-[17px] mobile:font-extrabold">
        {title}
      </h2>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="text-text-faint hover:text-text mobile:flex mobile:h-9 mobile:w-9 mobile:items-center mobile:justify-center mobile:rounded-full mobile:bg-seg mobile:text-text"
      >
        ✕
      </button>
    </div>
  );
}

const SECTION_HEADING =
  'text-[11px] font-bold tracking-[0.07em] text-text-faint uppercase mobile:text-xs';
const SECONDARY_BUTTON =
  'rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-text-muted hover:bg-surface-2 mobile:h-[52px] mobile:rounded-2xl mobile:border-border mobile:px-5 mobile:text-[15px] mobile:font-bold mobile:text-text';

/** Create (`template` omitted) or edit a template. One page rather than the wizard's steps:
 * only the name is required, so there is nothing to gate step by step, and editing a template
 * usually means changing one field.
 *
 * Unlike the wizard, the whole dialog is one <form> from the start. The wizard avoids that
 * because a premature submit there creates a live automation; here a submit is the intended
 * Save, and Enter in the keyword box is intercepted by TriggerFields. */
export function TemplateEditorDialog({
  template,
  variant,
  isFirstTemplate = false,
  onClose,
}: {
  template?: AutomationTemplate;
  variant: TemplateVariant;
  /** Creating the organization's first template - it will become the default, so say so. */
  isFirstTemplate?: boolean;
  onClose: () => void;
}) {
  const fields = useAutomationFields(template ? templateFieldValues(template) : EMPTY_FIELD_VALUES);
  const [name, setName] = useState(template?.name ?? '');
  const [error, setError] = useState<string | null>(null);
  const toast = useTemplateToast();
  const nameId = useId();
  const canSave = name.trim().length > 0 && !fields.overLimit;
  const title = template ? 'Edit template' : 'Create template';

  // An async function as the form action: React keeps the form pending (and
  // FormPendingOverlay showing) until it settles. On failure the dialog stays open with
  // everything still typed in, and the reason shows next to Save.
  async function submit(formData: FormData) {
    setError(null);
    const result = await saveTemplateAction(formData);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onClose();
    if (template) {
      toast('updated');
    } else {
      toast(
        'created',
        isFirstTemplate ? `Saved. "${name.trim()}" is now your default template.` : undefined,
      );
    }
  }

  return (
    <DialogShell variant={variant} label={title}>
      <form action={submit} className="flex min-h-0 flex-1 flex-col">
        <FormPendingOverlay />
        {template && <input type="hidden" name="templateId" value={template.id} />}
        <AutomationHiddenInputs fields={fields} />

        <DialogHeader title={title} onClose={onClose} />

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 mobile:space-y-5 mobile:px-5 mobile:py-5">
          <div>
            <label
              htmlFor={nameId}
              className="block text-sm font-medium text-text mobile:text-[13px] mobile:font-bold"
            >
              Template name
            </label>
            <input
              id={nameId}
              name="name"
              type="text"
              value={name}
              maxLength={TEMPLATE_LIMITS.nameMax}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Price enquiry"
              className="mt-1 block w-full rounded-md border border-border-strong bg-surface px-3 py-1.5 text-sm text-text mobile:rounded-2xl mobile:border-border mobile:px-3.5 mobile:py-3 mobile:text-[15px]"
            />
            <p className="mt-1 text-xs text-text-muted">
              Only the name is required. Anything you leave empty is filled in when you create the
              automation.
            </p>
          </div>

          <p className={SECTION_HEADING}>When someone comments</p>
          <TriggerFields fields={fields} />

          <p className={SECTION_HEADING}>Send the DM</p>
          <MessageFields fields={fields} />

          <EnabledField
            fields={fields}
            onHint="Automations made from this template start replying as soon as they are created."
            offHint="Automations made from this template are created paused."
          />
        </div>

        <div className="flex flex-col gap-2 border-t border-border px-4 py-3 mobile:gap-2.5 mobile:px-5 mobile:pt-3 mobile:pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {error && (
            <p role="alert" className="text-xs text-danger mobile:text-[13px]">
              {error}
            </p>
          )}
          <div className="flex items-center justify-between gap-2 mobile:flex-col-reverse mobile:items-stretch">
            <span className="text-xs text-text-faint mobile:text-center">
              {isFirstTemplate && !template ? 'This will be your default template.' : ''}
            </span>
            <div className="flex gap-2 mobile:w-full">
              <button type="button" onClick={onClose} className={SECONDARY_BUTTON}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canSave}
                className="rounded-md bg-ink-950 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40 mobile:h-[52px] mobile:flex-1 mobile:rounded-2xl mobile:bg-accent mobile:px-6 mobile:text-[15px] mobile:font-bold mobile:text-accent-ink"
              >
                {template ? 'Save changes' : 'Save template'}
              </button>
            </div>
          </div>
        </div>
      </form>
    </DialogShell>
  );
}

/** "Delete template?" confirmation. Says which template takes over as the default, because
 * that is the one consequence of deleting a template that is not obvious. */
export function DeleteTemplateDialog({
  template,
  successorName,
  variant,
  onClose,
}: {
  template: AutomationTemplate;
  /** The template that becomes the default if this default one is deleted: the oldest other
   * one. Null when this is the last template. */
  successorName: string | null;
  variant: TemplateVariant;
  onClose: () => void;
}) {
  const { pending, run } = useTemplateAction();

  let consequence = '';
  if (template.isDefault) {
    consequence = successorName
      ? ` "${successorName}" becomes the new default.`
      : ' There will be no template left to fill in new automations.';
  }

  return (
    <DialogShell variant={variant} label="Delete template" size="sm">
      {pending && <LoadingOverlay />}
      <DialogHeader title="Delete template?" onClose={onClose} />
      <p className="px-4 py-4 text-sm leading-relaxed text-text-muted mobile:px-5 mobile:text-[14.5px]">
        &quot;{template.name}&quot; is removed for everyone in the organization. Automations already
        created from it keep running unchanged.
        {consequence && <strong className="font-semibold text-text">{consequence}</strong>}
      </p>
      <div className="flex justify-end gap-2 border-t border-border px-4 py-3 mobile:flex-col-reverse mobile:px-5 mobile:pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <button type="button" onClick={onClose} className={SECONDARY_BUTTON}>
          Cancel
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(() => deleteTemplateAction(template.id), {
              status: 'deleted',
              message:
                template.isDefault && successorName
                  ? `Template deleted. "${successorName}" is now the default.`
                  : undefined,
              onDone: onClose,
            })
          }
          className="rounded-md bg-danger px-4 py-1.5 text-sm font-medium text-danger-ink hover:opacity-90 mobile:h-[52px] mobile:rounded-2xl mobile:text-[15px] mobile:font-bold"
        >
          Delete template
        </button>
      </div>
    </DialogShell>
  );
}

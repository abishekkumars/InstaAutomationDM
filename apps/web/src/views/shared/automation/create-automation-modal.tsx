'use client';

import { useId, useState } from 'react';
import { AUTOMATION_LIMITS } from '@automationdm/validation';
import type { AutomationTemplate } from '@/app/templates/templates-data';
import { FormPendingOverlay } from '@/views/shared/loader';
import { Toggle } from '@/views/shared/toggle';
import { createAutomationAction } from '@/app/instagram/posts/[postId]/actions';
import {
  AUDIENCES,
  AutomationHiddenInputs,
  ButtonChips,
  EMPTY_FIELD_VALUES,
  EnabledField,
  MessageFields,
  TriggerFields,
  templateFieldValues,
  useAutomationFields,
  type AutomationFieldValues,
} from './automation-fields';

/** Derives a sensible default automation name from the post's own caption: first line, first
 * 75 characters, ellipsised. Falls back to a generic label for a captionless post. The user can
 * always overwrite it - this is a starting point, not a fixed value. */
export function defaultAutomationName(caption: string): string {
  const firstLine = caption.split('\n')[0]?.trim() ?? '';
  if (firstLine.length === 0) {
    return 'Comment automation';
  }
  return firstLine.length > 75 ? `${firstLine.slice(0, 75)}...` : firstLine;
}

/** The template the wizard applies on open. apps/api keeps exactly one default whenever any
 * template exists; the fallback to the first one only covers a row edited by hand. */
function defaultTemplate(templates: AutomationTemplate[]): AutomationTemplate | null {
  return templates.find((template) => template.isDefault) ?? templates[0] ?? null;
}

// A 3-step modal wizard (trigger -> message -> review), matching the reference mockup's shape.
// One client component owns all the form state so the review step can echo back what steps 1-2
// collected, and it submits through the same createAutomationAction server action the inline
// form used - no backend change was needed for the wizard itself.
//
// Templates (Phase 19): with any template saved, the wizard opens with the "Use a template"
// switch on and the organization's default applied. The dropdown swaps in another template;
// switching off empties every field for manual entry. The fields stay editable either way, and
// nothing here writes back to the template.
export function CreateAutomationModal({
  organizationId,
  accountId,
  postId,
  postCaption,
  templates = [],
  trigger = 'desktop',
}: {
  organizationId: string;
  accountId: string;
  postId: string;
  /** Seeds the name field - see defaultAutomationName. */
  postCaption: string;
  /** The organization's templates, oldest first. Empty hides the template controls' switch. */
  templates?: AutomationTemplate[];
  /** How the opener renders. The mobile post detail (Phase 18.4) uses a full-width, thumb-sized
   * button; the wizard itself is the same in both views, and is already full-screen on phones. */
  trigger?: 'desktop' | 'mobile';
}) {
  const initialTemplate = defaultTemplate(templates);
  const initialValues = (): AutomationFieldValues =>
    initialTemplate ? templateFieldValues(initialTemplate) : EMPTY_FIELD_VALUES;

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState(() => defaultAutomationName(postCaption));
  const [templateId, setTemplateId] = useState<string | null>(initialTemplate?.id ?? null);
  const fields = useAutomationFields(initialValues());
  const { values } = fields;

  // On the "Any comments" tab there are no keywords to require - that is the whole point of it.
  const step1Valid =
    name.trim().length > 0 && (values.triggerType === 'any' || values.keywords.length > 0);
  const step2Valid = values.dmMessage.trim().length > 0 && !fields.overLimit;

  function applyTemplate(id: string | null) {
    const template = id ? templates.find((t) => t.id === id) : undefined;
    setTemplateId(template?.id ?? null);
    fields.load(template ? templateFieldValues(template) : EMPTY_FIELD_VALUES);
  }

  function reset() {
    setStep(1);
    setName(defaultAutomationName(postCaption));
    applyTemplate(initialTemplate?.id ?? null);
  }

  function close() {
    setOpen(false);
    reset();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          trigger === 'mobile'
            ? 'h-[52px] w-full rounded-2xl bg-accent text-[15px] font-bold text-accent-ink'
            : 'rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:opacity-90'
        }
      >
        {trigger === 'mobile' ? 'Create automation' : '+ New automation'}
      </button>

      {open && (
        // No onClick={close} on the backdrop: a stray click outside the dialog used to discard
        // everything typed so far with no warning and no undo. Closing is deliberate only -
        // the ✕ button or Cancel.
        //
        // `h-dvh` as well as `inset-0` (Phase 16.3, requirement 15): on mobile browsers a fixed,
        // inset-0 element is sized against the large viewport, so this scroll container extended
        // behind the URL bar and its last rows - including the Next/Confirm footer - could not be
        // reached. See layout.tsx for the full explanation.
        //
        // `text-left` because the dialog renders inside its opener, and the mobile post page opens it
        // from a centered empty-state card. `data-variant` switches on the `mobile:` classes (the
        // mobile bottom-sheet design) when opened from the mobile view - see globals.css.
        <div
          data-variant={trigger === 'mobile' ? 'mobile' : undefined}
          className="fixed inset-0 z-50 flex h-dvh items-start justify-center overflow-y-auto bg-ink-950/60 p-0 text-left sm:items-center sm:p-6 mobile:items-end mobile:bg-ink-950/45"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Create automation"
            className="flex h-full w-full flex-col overflow-hidden bg-surface shadow-lg sm:h-auto sm:max-h-[85dvh] sm:max-w-lg sm:rounded-xl sm:border sm:border-border mobile:h-[92dvh] mobile:rounded-t-[28px] mobile:border-t mobile:border-glass-border mobile:shadow-glass"
          >
            {/* Steps 1-2 are a plain <div>; only step 3 renders a real <form>. A <form
                action={serverAction}> is submitted by React itself, and preventDefault() in an
                onSubmit handler does NOT reliably stop the action from running - which is why
                the earlier guard failed and step 2 still created the automation. With no form
                element on screen before step 3, there is nothing that can submit: premature
                creation is structurally impossible rather than merely guarded against. */}
            <StepShell isFinalStep={step === 3}>
              <input type="hidden" name="organizationId" value={organizationId} />
              <input type="hidden" name="accountId" value={accountId} />
              <input type="hidden" name="postId" value={postId} />
              <input type="hidden" name="name" value={name} />
              <AutomationHiddenInputs fields={fields} />

              {/* Grab handle - drawn only in the mobile bottom-sheet design. */}
              <span
                aria-hidden="true"
                className="mx-auto mt-2.5 hidden h-[5px] w-10 shrink-0 rounded-full bg-switch-off mobile:block"
              />

              <div className="flex items-center gap-2 border-b border-border px-4 py-3 mobile:px-5 mobile:pt-2 mobile:pb-4">
                <span className="text-lg mobile:hidden">💬</span>
                <h2 className="flex-1 text-sm font-semibold text-text mobile:text-[17px] mobile:font-extrabold">
                  {step === 1
                    ? 'When someone comments on your post or reel'
                    : step === 2
                      ? 'Send the DM'
                      : 'Review & launch'}
                </h2>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close"
                  className="text-text-faint hover:text-text mobile:flex mobile:h-9 mobile:w-9 mobile:items-center mobile:justify-center mobile:rounded-full mobile:bg-seg mobile:text-text"
                >
                  ✕
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-4 mobile:space-y-5 mobile:px-5 mobile:py-5">
                {step === 1 && (
                  <div className="space-y-4">
                    <TemplateSource
                      templates={templates}
                      templateId={templateId}
                      onChange={applyTemplate}
                    />

                    <div>
                      <label
                        htmlFor="automation-name"
                        className="block text-sm font-medium text-text mobile:text-[13px] mobile:font-bold"
                      >
                        Name
                      </label>
                      {/* No `name` attribute: the hidden field above is the single source of
                          truth for what gets submitted (see AutomationHiddenInputs). */}
                      {/* maxLength stops the over-limit input at the source rather than letting
                          the API reject it after a round trip - the caption prefill can easily
                          exceed 200 characters on a long post. The counter appears only near the
                          limit so it is not noise on a short name. */}
                      <input
                        id="automation-name"
                        type="text"
                        value={name}
                        maxLength={AUTOMATION_LIMITS.nameMax}
                        onChange={(e) => setName(e.target.value)}
                        className="mt-1 block w-full rounded-md border border-border-strong bg-surface px-3 py-1.5 text-sm text-text mobile:rounded-2xl mobile:border-border mobile:px-3.5 mobile:py-3 mobile:text-[15px]"
                      />
                      {name.length > AUTOMATION_LIMITS.nameMax - 40 && (
                        <p className="mt-1 text-right text-xs text-text-faint">
                          {name.length} / {AUTOMATION_LIMITS.nameMax}
                        </p>
                      )}
                    </div>

                    <TriggerFields fields={fields} />

                    <EnabledField
                      fields={fields}
                      onHint="Starts replying to matching comments as soon as it is created."
                      offHint="Created but paused - it will not reply until you enable it."
                    />
                  </div>
                )}

                {step === 2 && <MessageFields fields={fields} />}

                {step === 3 && (
                  <div className="space-y-4 text-sm">
                    <ReviewRow label="When someone comments">
                      <p className="text-text">This post/reel</p>
                    </ReviewRow>
                    <ReviewRow
                      label={
                        values.triggerType === 'any'
                          ? 'with any text at all'
                          : 'and the comment matches'
                      }
                    >
                      {values.triggerType === 'any' ? (
                        <p className="text-text">Every comment triggers this automation</p>
                      ) : (
                        <>
                          <p className="text-text-faint">{values.matchMode}</p>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {values.keywords.map((keyword) => (
                              <span
                                key={keyword}
                                className="rounded-full bg-muted-bg px-2.5 py-0.5 text-xs font-medium text-text mobile:bg-accent-soft mobile:px-3 mobile:py-1.5 mobile:text-[13px] mobile:font-bold mobile:text-accent"
                              >
                                {keyword}
                              </span>
                            ))}
                          </div>
                        </>
                      )}
                    </ReviewRow>
                    {values.audience !== 'any' && (
                      <ReviewRow label="but only for">
                        <p className="text-text">
                          {AUDIENCES.find((option) => option.value === values.audience)?.label}
                        </p>
                      </ReviewRow>
                    )}
                    {values.replyEnabled && values.commentReply && (
                      <ReviewRow
                        label={
                          fields.submittedVariations.length > 0
                            ? `reply publicly with one of these ${fields.submittedVariations.length + 1}, at random`
                            : 'reply publicly with'
                        }
                      >
                        <p className="whitespace-pre-wrap break-words rounded-lg bg-muted-bg px-3 py-2 text-text mobile:rounded-2xl mobile:bg-seg mobile:px-3.5 mobile:py-3">
                          &quot;{values.commentReply}&quot;
                        </p>
                        {fields.submittedVariations.map((reply, index) => (
                          <p
                            key={index}
                            className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-muted-bg px-3 py-2 text-text mobile:rounded-2xl mobile:bg-seg mobile:px-3.5 mobile:py-3"
                          >
                            &quot;{reply}&quot;
                          </p>
                        ))}
                      </ReviewRow>
                    )}
                    <ReviewRow label="and send this DM">
                      <p className="whitespace-pre-wrap break-words rounded-lg bg-muted-bg px-3 py-2 text-text mobile:rounded-2xl mobile:bg-seg mobile:px-3.5 mobile:py-3">
                        {values.dmMessage}
                      </p>
                      <ButtonChips buttons={values.buttons} />
                    </ReviewRow>
                    {values.buttons.some((b) => b.url) && (
                      <ReviewRow label="clicks on those links will be tracked">
                        <p className="text-xs text-text-faint">
                          Zernio wraps them in a tracked redirect (on by default) so this dashboard
                          can show clicks per automation.
                        </p>
                      </ReviewRow>
                    )}
                    <ReviewRow label="and it starts">
                      <span
                        className={
                          values.isActive
                            ? 'inline-block rounded-full border border-success-border bg-success-bg px-2.5 py-0.5 text-xs font-semibold text-success'
                            : 'inline-block rounded-full bg-muted-bg px-2.5 py-0.5 text-xs font-semibold text-text-faint'
                        }
                      >
                        {values.isActive ? 'Enabled' : 'Disabled'}
                      </span>
                    </ReviewRow>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-border px-4 py-3 mobile:flex-col mobile:items-stretch mobile:gap-2.5 mobile:px-5 mobile:pt-3 mobile:pb-[calc(1rem+env(safe-area-inset-bottom))]">
                <span className="text-xs text-text-faint">Step {step} of 3</span>
                <div className="flex gap-2 mobile:w-full">
                  {step === 1 ? (
                    // The backdrop no longer closes the dialog, so step 1 needs an explicit
                    // way out that is not just the small corner ✕.
                    <button
                      type="button"
                      onClick={close}
                      className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-text-muted hover:bg-surface-2 mobile:h-[52px] mobile:rounded-2xl mobile:border-border mobile:px-5 mobile:text-[15px] mobile:font-bold mobile:text-text"
                    >
                      Cancel
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setStep((step - 1) as 1 | 2 | 3)}
                      className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-text-muted hover:bg-surface-2 mobile:h-[52px] mobile:rounded-2xl mobile:border-border mobile:px-5 mobile:text-[15px] mobile:font-bold mobile:text-text"
                    >
                      Back
                    </button>
                  )}
                  {step < 3 ? (
                    <button
                      type="button"
                      onClick={() => setStep((step + 1) as 1 | 2 | 3)}
                      disabled={step === 1 ? !step1Valid : !step2Valid}
                      className="rounded-md bg-ink-950 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40 mobile:h-[52px] mobile:flex-1 mobile:rounded-2xl mobile:bg-accent mobile:px-6 mobile:text-[15px] mobile:font-bold mobile:text-accent-ink"
                    >
                      Next
                    </button>
                  ) : (
                    // data-confirm is what onSubmit looks for: the only control permitted to
                    // actually submit the form.
                    <button
                      type="submit"
                      data-confirm="true"
                      className="rounded-md bg-ink-950 px-4 py-1.5 text-sm font-medium text-white mobile:h-[52px] mobile:flex-1 mobile:rounded-2xl mobile:bg-accent mobile:px-6 mobile:text-[15px] mobile:font-bold mobile:text-accent-ink"
                    >
                      Confirm &amp; create
                    </button>
                  )}
                </div>
              </div>
            </StepShell>
          </div>
        </div>
      )}
    </>
  );
}

/** "Use a template" switch plus the template dropdown (Phase 19). `templateId` null means
 * manual. With no templates saved there is nothing to switch, so it only points at the
 * Templates page. */
function TemplateSource({
  templates,
  templateId,
  onChange,
}: {
  templates: AutomationTemplate[];
  templateId: string | null;
  onChange: (templateId: string | null) => void;
}) {
  const selectId = useId();
  const usingTemplate = templateId !== null;

  if (templates.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-xs text-text-muted mobile:rounded-[18px] mobile:px-3.5 mobile:py-3 mobile:text-[13px]">
        Filling in the same fields every time? Save them as a template on the Templates page and
        they will be filled in here automatically.
      </p>
    );
  }

  return (
    <div className="space-y-2.5 rounded-lg border border-accent-soft-border bg-accent-soft p-3 mobile:rounded-[18px] mobile:p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-text mobile:text-[14px] mobile:font-bold">
            Use a template
          </p>
          <p className="mt-0.5 text-xs text-text-muted mobile:text-[12.5px]">
            {usingTemplate
              ? 'The fields below are filled in from the template. Change anything for this post; the template itself stays as it is.'
              : 'Manual. Every field starts empty.'}
          </p>
        </div>
        <Toggle
          checked={usingTemplate}
          onChange={() => onChange(usingTemplate ? null : (defaultTemplate(templates)?.id ?? null))}
          label="Use a template"
        />
      </div>
      {usingTemplate && (
        <div>
          <label
            htmlFor={selectId}
            className="block text-xs font-medium text-text mobile:text-[13px] mobile:font-bold"
          >
            Template
          </label>
          <select
            id={selectId}
            value={templateId}
            onChange={(e) => onChange(e.target.value)}
            className="mt-1 block w-full rounded-md border border-border-strong bg-surface px-3 py-1.5 text-sm text-text mobile:rounded-2xl mobile:border-border mobile:px-3.5 mobile:py-3 mobile:text-[15px]"
          >
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
                {template.isDefault ? ' (default)' : ''}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-text-muted">
            Picking another template replaces the fields below.
          </p>
        </div>
      )}
    </div>
  );
}

/** Wraps the wizard body in a real <form action={createAutomationAction}> ONLY on the final
 * step. Before that it is an inert <div>, so there is no form element on the page that could
 * submit - by Enter, by an implicit submission, or by React's own action handling. */
function StepShell({ isFinalStep, children }: { isFinalStep: boolean; children: React.ReactNode }) {
  if (!isFinalStep) {
    return <div className="flex min-h-0 flex-1 flex-col">{children}</div>;
  }
  return (
    <form action={createAutomationAction} className="flex min-h-0 flex-1 flex-col">
      {/* Inside the form on purpose - useFormStatus only reports on its nearest parent form. */}
      <FormPendingOverlay />
      {children}
    </form>
  );
}

function ReviewRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="shrink-0 text-text-faint">↳</span>
      {/* min-w-0: a flex item's default min-width is auto, meaning it refuses to shrink below
          its content's intrinsic width. Long DM text then forces this column wider than the
          modal instead of wrapping inside it. */}
      <div className="min-w-0 flex-1">
        <p className="text-xs text-text-muted">{label}</p>
        <div className="mt-1">{children}</div>
      </div>
    </div>
  );
}

'use client';

import { useId, useState, type KeyboardEvent } from 'react';
import { AUTOMATION_LIMITS } from '@automationdm/validation';
import type { AutomationTemplate } from '@/app/templates/templates-data';
import { Toggle } from '@/views/shared/toggle';
import { ReplySuggestions } from './reply-suggestions';

// The create popup's fields, shared since Phase 19 by the create-automation wizard and the
// template editor. A template holds exactly what the popup holds, so both must render the same
// controls with the same limits. Otherwise a template could save a value the popup then rejects.
//
// `useAutomationFields` owns the state, the field components render it, and
// `AutomationHiddenInputs` turns it into the FormData both server actions read. The `mobile:`
// classes switch on inside any `data-variant="mobile"` ancestor (see globals.css), so each
// component renders either design without a prop.

export type MatchMode = 'contains' | 'word' | 'exact';
export type TriggerType = 'keywords' | 'any';
export type Audience = 'any' | 'follower' | 'non_follower';

export interface ButtonValue {
  title: string;
  url: string;
}

interface ButtonRow extends ButtonValue {
  key: number;
}

/** Everything the popup collects apart from the automation's own name, which comes from the
 * post caption and is not part of a template. */
export interface AutomationFieldValues {
  triggerType: TriggerType;
  keywords: string[];
  matchMode: MatchMode;
  audience: Audience;
  replyEnabled: boolean;
  commentReply: string;
  /** Alternate public replies. Zernio rotates over `[commentReply, ...these]`, one picked at
   * random per triggering comment - it does not post all of them. */
  replyVariations: string[];
  dmMessage: string;
  buttons: ButtonValue[];
  isActive: boolean;
}

export const EMPTY_FIELD_VALUES: AutomationFieldValues = {
  triggerType: 'keywords',
  keywords: [],
  matchMode: 'contains',
  audience: 'any',
  replyEnabled: false,
  commentReply: '',
  replyVariations: [],
  dmMessage: '',
  buttons: [],
  isActive: true,
};

/** A template as form values. The public-reply switch is on exactly when the template has a
 * reply, so a template never pre-fills text behind a switched-off toggle. */
export function templateFieldValues(template: AutomationTemplate): AutomationFieldValues {
  return {
    triggerType: template.triggerType,
    keywords: template.keywords,
    matchMode: template.matchMode,
    audience: template.audience,
    replyEnabled: Boolean(template.commentReply),
    commentReply: template.commentReply ?? '',
    replyVariations: template.commentReplyVariations,
    dmMessage: template.dmMessage ?? '',
    buttons: template.buttons,
    isActive: template.isActive,
  };
}

/** Requirement 12: the trigger is now a choice between matching keywords and answering every
 * comment. "Any comments" is not a separate Zernio feature - it is an empty `keywords` array,
 * which Zernio documents as "any comment triggers". */
const TRIGGER_TYPES: { value: TriggerType; label: string; hint: string }[] = [
  {
    value: 'keywords',
    label: 'Specific keyword',
    hint: 'Only comments containing one of your keywords trigger the automation.',
  },
  {
    value: 'any',
    label: 'Any comments',
    hint: 'Every comment on this post or reel triggers the automation.',
  },
];

/** Requirement 11: Zernio's `audience.followerStatus`. */
export const AUDIENCES: { value: Audience; label: string; hint: string }[] = [
  { value: 'any', label: 'Everyone', hint: 'Reply to any commenter.' },
  {
    value: 'follower',
    label: 'Followers only',
    hint: 'Only send to accounts that follow you.',
  },
  {
    value: 'non_follower',
    label: 'Non-followers',
    hint: 'Only send to accounts that do not follow you yet.',
  },
];

// Re-exported from packages/validation so the form and the schema can never disagree about a
// limit - see AUTOMATION_LIMITS for why these are centralised.
const MAX_REPLY_VARIATIONS = AUTOMATION_LIMITS.commentReplyVariationsMax;
const MAX_BUTTONS = AUTOMATION_LIMITS.buttonsMax;
const LIMIT_WITH_BUTTONS = AUTOMATION_LIMITS.dmMessageWithButtonsMax;
const LIMIT_PLAIN = AUTOMATION_LIMITS.dmMessageMax;

const MATCH_MODES: { value: MatchMode; label: string }[] = [
  { value: 'contains', label: 'Contains' },
  { value: 'word', label: 'Word' },
  { value: 'exact', label: 'Exact' },
];

interface FieldState extends Omit<AutomationFieldValues, 'buttons'> {
  buttons: ButtonRow[];
  /** Next button row key. Kept in state (not a ref) so assigning keys stays a pure update. */
  nextButtonKey: number;
}

function toState(values: AutomationFieldValues): FieldState {
  return {
    ...values,
    keywords: [...values.keywords],
    replyVariations: [...values.replyVariations],
    buttons: values.buttons.map((button, index) => ({ ...button, key: index })),
    nextButtonKey: values.buttons.length,
  };
}

export function useAutomationFields(initial: AutomationFieldValues) {
  const [state, setState] = useState(() => toState(initial));
  const [keywordDraft, setKeywordDraft] = useState('');

  const limit = state.buttons.length > 0 ? LIMIT_WITH_BUTTONS : LIMIT_PLAIN;
  const overLimit = state.dmMessage.length > limit;

  function update(patch: Partial<Omit<FieldState, 'buttons' | 'nextButtonKey'>>) {
    setState((current) => ({ ...current, ...patch }));
  }

  return {
    values: state,
    keywordDraft,
    setKeywordDraft,
    limit,
    overLimit,
    /** What actually gets submitted. On the "Any comments" tab this is empty, which is how
     * Zernio is told to trigger on everything - the typed keywords are kept in state rather than
     * cleared, so switching tabs back and forth does not silently destroy them. */
    submittedKeywords: state.triggerType === 'any' ? [] : state.keywords,
    /** Only non-blank alternates are worth sending, and only when there is a primary reply for
     * Zernio to rotate them against (the API rejects variations without one). */
    submittedVariations:
      state.replyEnabled && state.commentReply.trim().length > 0
        ? state.replyVariations.map((reply) => reply.trim()).filter((reply) => reply.length > 0)
        : [],
    update,
    /** Replaces every field at once - applying a template, or resetting the form. */
    load(values: AutomationFieldValues) {
      setState(toState(values));
      setKeywordDraft('');
    },
    addKeyword() {
      const value = keywordDraft.trim();
      setKeywordDraft('');
      if (value.length === 0 || state.keywords.includes(value)) return;
      update({ keywords: [...state.keywords, value] });
    },
    removeKeyword(keyword: string) {
      update({ keywords: state.keywords.filter((k) => k !== keyword) });
    },
    addButton() {
      setState((current) =>
        current.buttons.length >= MAX_BUTTONS
          ? current
          : {
              ...current,
              buttons: [...current.buttons, { key: current.nextButtonKey, title: '', url: '' }],
              nextButtonKey: current.nextButtonKey + 1,
            },
      );
    },
    removeButton(key: number) {
      setState((current) => ({
        ...current,
        buttons: current.buttons.filter((b) => b.key !== key),
      }));
    },
    updateButton(key: number, field: 'title' | 'url', value: string) {
      setState((current) => ({
        ...current,
        buttons: current.buttons.map((b) => (b.key === key ? { ...b, [field]: value } : b)),
      }));
    },
  };
}

export type AutomationFields = ReturnType<typeof useAutomationFields>;

const LABEL = 'block text-sm font-medium text-text mobile:text-[13px] mobile:font-bold';
const INPUT =
  'rounded-md border border-border-strong bg-surface px-3 py-1.5 text-sm text-text mobile:rounded-2xl mobile:border-border mobile:px-3.5 mobile:py-3 mobile:text-[15px]';
const SEGMENTED =
  'mt-1 inline-flex rounded-md border border-border-strong p-0.5 mobile:flex mobile:rounded-[14px] mobile:border-0 mobile:bg-seg mobile:p-1';
const SEGMENT_ON =
  'rounded-[5px] bg-accent px-3 py-1 text-xs font-semibold text-accent-ink mobile:flex-1 mobile:rounded-[11px] mobile:bg-seg-selected mobile:py-2.5 mobile:text-[13.5px] mobile:font-bold mobile:text-text mobile:shadow-sm';
const SEGMENT_OFF =
  'rounded-[5px] px-3 py-1 text-xs font-medium text-text-muted hover:text-text mobile:flex-1 mobile:py-2.5 mobile:text-[13.5px] mobile:font-bold';
const DASHED_BUTTON =
  'mt-2 w-full rounded-md border border-dashed border-border-strong px-3 py-2 text-xs font-medium text-text-muted hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40 mobile:h-11 mobile:rounded-2xl mobile:text-[13px] mobile:font-bold';

/** Step 1 of the wizard, minus the name and the Enabled switch: trigger, match mode, keywords,
 * audience, and the public reply with its alternates. */
export function TriggerFields({ fields }: { fields: AutomationFields }) {
  const { values, update } = fields;

  function onKeywordKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // preventDefault also stops Enter from submitting the template editor's form.
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      fields.addKeyword();
    }
  }

  return (
    <>
      {/* Requirement 12: the two trigger tabs. Rendered as a tablist rather than a toggle
          because the choice changes which fields exist below it. */}
      <div>
        <div
          role="tablist"
          aria-label="What triggers this automation"
          className="flex rounded-md border border-border-strong p-0.5 mobile:flex mobile:rounded-[14px] mobile:border-0 mobile:bg-seg mobile:p-1"
        >
          {TRIGGER_TYPES.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={values.triggerType === option.value}
              onClick={() => update({ triggerType: option.value })}
              className={
                values.triggerType === option.value
                  ? 'flex-1 rounded-[5px] bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink mobile:flex-1 mobile:rounded-[11px] mobile:bg-seg-selected mobile:py-2.5 mobile:text-[13.5px] mobile:font-bold mobile:text-text mobile:shadow-sm'
                  : 'flex-1 rounded-[5px] px-3 py-1.5 text-xs font-medium text-text-muted hover:text-text mobile:flex-1 mobile:py-2.5 mobile:text-[13.5px] mobile:font-bold'
              }
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-text-muted">
          {TRIGGER_TYPES.find((option) => option.value === values.triggerType)?.hint}
        </p>
      </div>

      {/* Match mode and the keyword list are hidden entirely on the "Any comments" tab, exactly
          as requirement 12 asks - with no keywords there is nothing for a match mode to apply
          to, so showing a disabled control would just raise a question it cannot answer. */}
      {values.triggerType === 'keywords' && (
        <>
          <div>
            <span className={LABEL}>Match mode</span>
            <div className={SEGMENTED}>
              {MATCH_MODES.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => update({ matchMode: mode.value })}
                  className={values.matchMode === mode.value ? SEGMENT_ON : SEGMENT_OFF}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className={LABEL}>Should include any of these keywords</span>
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                value={fields.keywordDraft}
                onChange={(e) => fields.setKeywordDraft(e.target.value)}
                onKeyDown={onKeywordKeyDown}
                placeholder="Type a keyword and press Enter"
                className={`flex-1 ${INPUT}`}
              />
              <button
                type="button"
                onClick={fields.addKeyword}
                className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-text-muted hover:bg-surface-2 mobile:h-[52px] mobile:rounded-2xl mobile:border-border mobile:px-5 mobile:text-[15px] mobile:font-bold mobile:text-text"
              >
                + Add
              </button>
            </div>
            {values.keywords.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {values.keywords.map((keyword) => (
                  <span
                    key={keyword}
                    className="inline-flex items-center gap-1.5 rounded-full bg-muted-bg px-2.5 py-1 text-xs font-medium text-text mobile:bg-accent-soft mobile:px-3 mobile:py-1.5 mobile:text-[13px] mobile:font-bold mobile:text-accent"
                  >
                    {keyword}
                    <button
                      type="button"
                      onClick={() => fields.removeKeyword(keyword)}
                      aria-label={`Remove ${keyword}`}
                      className="text-text-faint hover:text-text"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
            <p className="mt-1 text-xs text-text-muted">
              Any comment matching one of these triggers the automation. At least one is required.
            </p>
          </div>
        </>
      )}

      {/* Requirement 11. Zernio only learns the follow relationship for people who have
          messaged the account before, so this is a best-effort filter - see
          docs/ZERNIO-INTEGRATION.md. */}
      <div>
        <span className={LABEL}>Send to</span>
        <div className={SEGMENTED}>
          {AUDIENCES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => update({ audience: option.value })}
              className={values.audience === option.value ? SEGMENT_ON : SEGMENT_OFF}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-text-muted">
          {AUDIENCES.find((option) => option.value === values.audience)?.hint}
          {values.audience !== 'any' &&
            ' Instagram only reveals this for people who have messaged you before; anyone else is still sent to.'}
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-text mobile:text-[13px] mobile:font-bold">
            Public reply on the comment (optional)
          </span>
          <Toggle
            checked={values.replyEnabled}
            onChange={() => update({ replyEnabled: !values.replyEnabled })}
            label="Enable public reply"
          />
        </div>
        {values.replyEnabled && (
          <>
            <textarea
              rows={2}
              value={values.commentReply}
              maxLength={AUTOMATION_LIMITS.commentReplyMax}
              onChange={(e) => update({ commentReply: e.target.value })}
              placeholder="Thanks! Sent you a DM 🙌"
              className={`mt-2 block w-full ${INPUT}`}
            />
            <ReplySuggestions
              value={values.commentReply}
              onAppend={(commentReply) => update({ commentReply })}
            />

            {/* Requirement 13: up to 5 alternates on top of the reply above. */}
            {values.replyVariations.length > 0 && (
              <div className="mt-2 space-y-2">
                {values.replyVariations.map((reply, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={reply}
                      maxLength={AUTOMATION_LIMITS.commentReplyMax}
                      onChange={(e) =>
                        update({
                          replyVariations: values.replyVariations.map((existing, i) =>
                            i === index ? e.target.value : existing,
                          ),
                        })
                      }
                      placeholder={`Alternative reply ${index + 1}`}
                      className={`flex-1 ${INPUT}`}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        update({
                          replyVariations: values.replyVariations.filter((_, i) => i !== index),
                        })
                      }
                      aria-label={`Remove alternative reply ${index + 1}`}
                      className="px-1 text-text-faint hover:text-text mobile:px-2 mobile:text-base"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {values.replyVariations.length < MAX_REPLY_VARIATIONS && (
              <button
                type="button"
                onClick={() => update({ replyVariations: [...values.replyVariations, ''] })}
                // Disabled until there is a primary reply: Zernio rotates over
                // [commentReply, ...variations], so alternates with nothing to rotate against
                // are rejected by the API.
                disabled={values.commentReply.trim().length === 0}
                className={DASHED_BUTTON}
              >
                + Add another reply ({MAX_REPLY_VARIATIONS - values.replyVariations.length} left)
              </button>
            )}
          </>
        )}
        <p className="mt-1 text-xs text-text-muted">
          Posted publicly under the triggering comment. Leave the toggle off to skip a public reply.
          {values.replyEnabled && values.replyVariations.length > 0 && (
            <>
              {' '}
              With alternatives added, Instagram shows{' '}
              <strong className="font-medium">one of them picked at random</strong> per comment -
              not all of them - so repeat commenters do not all see the same wording.
            </>
          )}
        </p>
      </div>
    </>
  );
}

/** The "start enabled" switch. The hints differ between an automation (created now) and a
 * template (every automation created from it later). */
export function EnabledField({
  fields,
  onHint,
  offHint,
}: {
  fields: AutomationFields;
  onHint: string;
  offHint: string;
}) {
  const { values, update } = fields;
  return (
    <div className="border-t border-border pt-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-text mobile:text-[13px] mobile:font-bold">
          Enabled
        </span>
        <Toggle
          checked={values.isActive}
          onChange={() => update({ isActive: !values.isActive })}
          label="Enable automation"
        />
      </div>
      <p className="mt-1 text-xs text-text-muted">{values.isActive ? onHint : offHint}</p>
    </div>
  );
}

/** Step 2 of the wizard: the DM, its buttons, and a live preview. */
export function MessageFields({ fields }: { fields: AutomationFields }) {
  const { values, update, limit, overLimit } = fields;
  const dmId = useId();

  return (
    <div>
      <label htmlFor={dmId} className={LABEL}>
        DM message
      </label>
      {/* Capped at the *plain* limit, not `limit`: lowering maxLength to 640 while text longer
          than that is already in the box would leave the field in a state the user cannot see
          the end of. The counter turns red and Next disables instead, which is recoverable. */}
      <textarea
        id={dmId}
        rows={3}
        value={values.dmMessage}
        maxLength={AUTOMATION_LIMITS.dmMessageMax}
        onChange={(e) => update({ dmMessage: e.target.value })}
        className={`mt-1 block w-full ${INPUT}`}
      />
      <p className={`mt-1 text-right text-xs ${overLimit ? 'text-danger' : 'text-text-faint'}`}>
        {values.dmMessage.length} / {limit}
        {values.buttons.length > 0 && ' — limit drops to 640 once a button is added'}
      </p>

      <div className="mt-3 flex items-baseline justify-between">
        <span className="text-sm font-medium text-text mobile:text-[13px] mobile:font-bold">
          Buttons (optional)
        </span>
        <span className="text-xs text-text-faint">
          {values.buttons.length} / {MAX_BUTTONS} used
        </span>
      </div>
      {values.buttons.length > 0 && (
        <div className="mt-1.5 space-y-2">
          {values.buttons.map((row) => (
            <div key={row.key} className="flex gap-2">
              <input
                type="text"
                value={row.title}
                onChange={(e) => fields.updateButton(row.key, 'title', e.target.value)}
                maxLength={AUTOMATION_LIMITS.buttonTitleMax}
                placeholder="Label (max 20 chars)"
                className="w-32 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-text mobile:rounded-2xl mobile:border-border mobile:px-3.5 mobile:py-3 mobile:text-[15px]"
              />
              <input
                type="text"
                value={row.url}
                onChange={(e) => fields.updateButton(row.key, 'url', e.target.value)}
                placeholder="https://..."
                className="flex-1 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-text mobile:rounded-2xl mobile:border-border mobile:px-3.5 mobile:py-3 mobile:text-[15px]"
              />
              <button
                type="button"
                onClick={() => fields.removeButton(row.key)}
                aria-label="Remove button"
                className="px-1 text-text-faint hover:text-text mobile:px-2 mobile:text-base"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      {values.buttons.length < MAX_BUTTONS && (
        <button type="button" onClick={fields.addButton} className={DASHED_BUTTON}>
          + Add button ({MAX_BUTTONS - values.buttons.length} left)
        </button>
      )}
      <p className="mt-1 text-xs text-text-muted">
        Up to 3 buttons, each a short label and a link, shown under the DM. Zernio tracks clicks on
        each link automatically.
      </p>

      {(values.dmMessage || values.buttons.length > 0) && (
        <div className="mt-4 overflow-hidden rounded-lg border border-border bg-muted-bg p-3 mobile:rounded-[18px] mobile:border-0 mobile:bg-seg mobile:p-3.5">
          <p className="mb-2 text-xs text-text-faint">Preview</p>
          {/* whitespace-pre-wrap keeps the user's own line breaks; break-words splits a long
              unbroken run (a pasted URL, a word with no spaces) that would otherwise render as
              one line wider than the bubble and overflow the modal. min-w-0 lets the bubble
              actually shrink inside its flex/grid parent instead of being sized by its
              content. */}
          <div className="min-w-0 whitespace-pre-wrap break-words rounded-2xl bg-surface px-3 py-2 text-sm text-text shadow-sm mobile:rounded-[18px] mobile:rounded-bl-md mobile:px-3.5 mobile:py-3">
            {values.dmMessage || '(your DM message)'}
          </div>
          <ButtonChips buttons={values.buttons} />
        </div>
      )}
    </div>
  );
}

/** The labelled buttons as chips, as they appear under the DM. */
export function ButtonChips({ buttons }: { buttons: ButtonValue[] }) {
  const labelled = buttons.filter((b) => b.title);
  if (labelled.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {labelled.map((b, index) => (
        <span
          key={index}
          className="max-w-full truncate rounded-full border border-border-strong px-2.5 py-1 text-xs font-medium text-text"
        >
          {b.title}
        </span>
      ))}
    </div>
  );
}

/** The form's submitted values. Every one lives in a hidden field, NOT in the visible inputs:
 * those are conditionally rendered (the wizard's steps, the reply toggle), and an unmounted
 * input never reaches FormData. createAutomationAction and saveTemplateAction read the same
 * names. */
export function AutomationHiddenInputs({ fields }: { fields: AutomationFields }) {
  const { values } = fields;
  return (
    <>
      <input type="hidden" name="triggerType" value={values.triggerType} />
      <input type="hidden" name="keywords" value={fields.submittedKeywords.join(',')} />
      <input type="hidden" name="matchMode" value={values.matchMode} />
      <input type="hidden" name="audience" value={values.audience} />
      <input
        type="hidden"
        name="commentReply"
        value={values.replyEnabled ? values.commentReply : ''}
      />
      {/* One field per alternate, read back with getAll() - same positional convention as the
          button rows below. */}
      {fields.submittedVariations.map((reply, index) => (
        <input key={index} type="hidden" name="commentReplyVariation" value={reply} />
      ))}
      <input type="hidden" name="dmMessage" value={values.dmMessage} />
      <input type="hidden" name="isActive" value={values.isActive ? 'true' : 'false'} />
      {values.buttons
        .filter((button) => button.title.trim() && button.url.trim())
        .map((button) => (
          <div key={button.key}>
            <input type="hidden" name="buttonTitle" value={button.title} />
            <input type="hidden" name="buttonUrl" value={button.url} />
          </div>
        ))}
    </>
  );
}

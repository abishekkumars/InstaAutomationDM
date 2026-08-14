'use client';

import { useState, type KeyboardEvent } from 'react';
import { AUTOMATION_LIMITS } from '@automationdm/validation';
import { FormPendingOverlay } from '../../../loader';
import { Toggle } from '@/app/toggle';
import { ReplySuggestions } from '@/app/reply-suggestions';
import { createAutomationAction } from './actions';

interface ButtonRow {
  key: number;
  title: string;
  url: string;
}

type MatchMode = 'contains' | 'word' | 'exact';
type TriggerType = 'keywords' | 'any';
type Audience = 'any' | 'follower' | 'non_follower';

const MAX_REPLY_VARIATIONS = AUTOMATION_LIMITS.commentReplyVariationsMax;

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
const AUDIENCES: { value: Audience; label: string; hint: string }[] = [
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
const MAX_BUTTONS = AUTOMATION_LIMITS.buttonsMax;
const LIMIT_WITH_BUTTONS = AUTOMATION_LIMITS.dmMessageWithButtonsMax;
const LIMIT_PLAIN = AUTOMATION_LIMITS.dmMessageMax;

const MATCH_MODES: { value: MatchMode; label: string }[] = [
  { value: 'contains', label: 'Contains' },
  { value: 'word', label: 'Word' },
  { value: 'exact', label: 'Exact' },
];

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

// A 3-step modal wizard (trigger -> message -> review), matching the reference mockup's shape.
// One client component owns all the form state so the review step can echo back what steps 1-2
// collected, and it submits through the same createAutomationAction server action the inline
// form used - no backend change was needed for the wizard itself.
export function CreateAutomationModal({
  organizationId,
  accountId,
  postId,
  postCaption,
}: {
  organizationId: string;
  accountId: string;
  postId: string;
  /** Seeds the name field - see defaultAutomationName. */
  postCaption: string;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [name, setName] = useState(() => defaultAutomationName(postCaption));
  const [isActive, setIsActive] = useState(true);
  const [triggerType, setTriggerType] = useState<TriggerType>('keywords');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordDraft, setKeywordDraft] = useState('');
  const [matchMode, setMatchMode] = useState<MatchMode>('contains');
  const [audience, setAudience] = useState<Audience>('any');
  const [replyEnabled, setReplyEnabled] = useState(false);
  const [commentReply, setCommentReply] = useState('');
  /** Alternate public replies. Zernio rotates over `[commentReply, ...these]`, one picked at
   * random per triggering comment - it does not post all of them. */
  const [replyVariations, setReplyVariations] = useState<string[]>([]);

  const [dmMessage, setDmMessage] = useState('');
  const [buttons, setButtons] = useState<ButtonRow[]>([]);
  const [nextButtonKey, setNextButtonKey] = useState(0);

  const limit = buttons.length > 0 ? LIMIT_WITH_BUTTONS : LIMIT_PLAIN;
  const overLimit = dmMessage.length > limit;
  // On the "Any comments" tab there are no keywords to require - that is the whole point of it.
  const step1Valid = name.trim().length > 0 && (triggerType === 'any' || keywords.length > 0);
  const step2Valid = dmMessage.trim().length > 0 && !overLimit;

  /** What actually gets submitted. On the "Any comments" tab this is empty, which is how Zernio
   * is told to trigger on everything - the typed keywords are kept in state rather than cleared,
   * so switching tabs back and forth does not silently destroy them. */
  const submittedKeywords = triggerType === 'any' ? [] : keywords;

  /** Only non-blank alternates are worth sending, and only when there is a primary reply for
   * Zernio to rotate them against (the API rejects variations without one). */
  const submittedVariations =
    replyEnabled && commentReply.trim().length > 0
      ? replyVariations.map((reply) => reply.trim()).filter((reply) => reply.length > 0)
      : [];

  function reset() {
    setStep(1);
    setName(defaultAutomationName(postCaption));
    setIsActive(true);
    setTriggerType('keywords');
    setKeywords([]);
    setKeywordDraft('');
    setMatchMode('contains');
    setAudience('any');
    setReplyEnabled(false);
    setCommentReply('');
    setReplyVariations([]);
    setDmMessage('');
    setButtons([]);
    setNextButtonKey(0);
  }

  function close() {
    setOpen(false);
    reset();
  }

  function addKeyword() {
    const value = keywordDraft.trim();
    if (value.length === 0 || keywords.includes(value)) {
      setKeywordDraft('');
      return;
    }
    setKeywords([...keywords, value]);
    setKeywordDraft('');
  }

  function onKeywordKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addKeyword();
    }
  }

  function addButton() {
    if (buttons.length >= MAX_BUTTONS) return;
    setButtons([...buttons, { key: nextButtonKey, title: '', url: '' }]);
    setNextButtonKey(nextButtonKey + 1);
  }

  function removeButton(key: number) {
    setButtons(buttons.filter((b) => b.key !== key));
  }

  function updateButton(key: number, field: 'title' | 'url', value: string) {
    setButtons(buttons.map((b) => (b.key === key ? { ...b, [field]: value } : b)));
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:opacity-90"
      >
        + New automation
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
        <div className="fixed inset-0 z-50 flex h-dvh items-start justify-center overflow-y-auto bg-ink-950/60 p-0 sm:items-center sm:p-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Create automation"
            className="flex h-full w-full flex-col overflow-hidden bg-surface shadow-lg sm:h-auto sm:max-h-[85dvh] sm:max-w-lg sm:rounded-xl sm:border sm:border-border"
          >
            {/* Steps 1-2 are a plain <div>; only step 3 renders a real <form>. A <form
                action={serverAction}> is submitted by React itself, and preventDefault() in an
                onSubmit handler does NOT reliably stop the action from running - which is why
                the earlier guard failed and step 2 still created the automation. With no form
                element on screen before step 3, there is nothing that can submit: premature
                creation is structurally impossible rather than merely guarded against. */}
            <StepShell isFinalStep={step === 3}>
              {/* Every submitted value lives in a hidden field, NOT in the visible step-1/2
                  inputs: those are conditionally rendered, so React unmounts them as the wizard
                  advances, and an unmounted input never reaches FormData. */}
              <input type="hidden" name="organizationId" value={organizationId} />
              <input type="hidden" name="accountId" value={accountId} />
              <input type="hidden" name="postId" value={postId} />
              <input type="hidden" name="name" value={name} />
              <input type="hidden" name="keywords" value={submittedKeywords.join(',')} />
              <input type="hidden" name="matchMode" value={matchMode} />
              <input type="hidden" name="audience" value={audience} />
              <input type="hidden" name="commentReply" value={replyEnabled ? commentReply : ''} />
              {/* One field per alternate, read back with getAll() - same positional convention as
                  the button rows below. */}
              {submittedVariations.map((reply, index) => (
                <input key={index} type="hidden" name="commentReplyVariation" value={reply} />
              ))}
              <input type="hidden" name="dmMessage" value={dmMessage} />
              <input type="hidden" name="isActive" value={isActive ? 'true' : 'false'} />
              {buttons
                .filter((button) => button.title.trim() && button.url.trim())
                .map((button) => (
                  <div key={button.key}>
                    <input type="hidden" name="buttonTitle" value={button.title} />
                    <input type="hidden" name="buttonUrl" value={button.url} />
                  </div>
                ))}

              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <span className="text-lg">💬</span>
                <h2 className="flex-1 text-sm font-semibold text-text">
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
                  className="text-text-faint hover:text-text"
                >
                  ✕
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-4">
                {step === 1 && (
                  <div className="space-y-4">
                    <div>
                      <label
                        htmlFor="automation-name"
                        className="block text-sm font-medium text-text"
                      >
                        Name
                      </label>
                      {/* No `name` attribute: the hidden field above is the single source of
                          truth for what gets submitted (see the comment there). */}
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
                        className="mt-1 block w-full rounded-md border border-border-strong bg-surface px-3 py-1.5 text-sm text-text"
                      />
                      {name.length > AUTOMATION_LIMITS.nameMax - 40 && (
                        <p className="mt-1 text-right text-xs text-text-faint">
                          {name.length} / {AUTOMATION_LIMITS.nameMax}
                        </p>
                      )}
                    </div>

                    {/* Requirement 12: the two trigger tabs. Rendered as a tablist rather than a
                        toggle because the choice changes which fields exist below it. */}
                    <div>
                      <div
                        role="tablist"
                        aria-label="What triggers this automation"
                        className="flex rounded-md border border-border-strong p-0.5"
                      >
                        {TRIGGER_TYPES.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            role="tab"
                            aria-selected={triggerType === option.value}
                            onClick={() => setTriggerType(option.value)}
                            className={
                              triggerType === option.value
                                ? 'flex-1 rounded-[5px] bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink'
                                : 'flex-1 rounded-[5px] px-3 py-1.5 text-xs font-medium text-text-muted hover:text-text'
                            }
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                      <p className="mt-1 text-xs text-text-muted">
                        {TRIGGER_TYPES.find((option) => option.value === triggerType)?.hint}
                      </p>
                    </div>

                    {/* Match mode and the keyword list are hidden entirely on the "Any comments"
                        tab, exactly as requirement 12 asks - with no keywords there is nothing
                        for a match mode to apply to, so showing a disabled control would just
                        raise a question it cannot answer. */}
                    {triggerType === 'keywords' && (
                      <>
                        <div>
                          <span className="block text-sm font-medium text-text">Match mode</span>
                          <div className="mt-1 inline-flex rounded-md border border-border-strong p-0.5">
                            {MATCH_MODES.map((mode) => (
                              <button
                                key={mode.value}
                                type="button"
                                onClick={() => setMatchMode(mode.value)}
                                className={
                                  matchMode === mode.value
                                    ? 'rounded-[5px] bg-accent px-3 py-1 text-xs font-semibold text-accent-ink'
                                    : 'rounded-[5px] px-3 py-1 text-xs font-medium text-text-muted hover:text-text'
                                }
                              >
                                {mode.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <span className="block text-sm font-medium text-text">
                            Should include any of these keywords
                          </span>
                          <div className="mt-1 flex gap-2">
                            <input
                              type="text"
                              value={keywordDraft}
                              onChange={(e) => setKeywordDraft(e.target.value)}
                              onKeyDown={onKeywordKeyDown}
                              placeholder="Type a keyword and press Enter"
                              className="flex-1 rounded-md border border-border-strong bg-surface px-3 py-1.5 text-sm text-text"
                            />
                            <button
                              type="button"
                              onClick={addKeyword}
                              className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-text-muted hover:bg-surface-2"
                            >
                              + Add
                            </button>
                          </div>
                          {keywords.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {keywords.map((keyword) => (
                                <span
                                  key={keyword}
                                  className="inline-flex items-center gap-1.5 rounded-full bg-muted-bg px-2.5 py-1 text-xs font-medium text-text"
                                >
                                  {keyword}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setKeywords(keywords.filter((k) => k !== keyword))
                                    }
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
                            Any comment matching one of these triggers the automation. At least one
                            is required.
                          </p>
                        </div>
                      </>
                    )}

                    {/* Requirement 11. Zernio only learns the follow relationship for people who
                        have messaged the account before, so this is a best-effort filter - see
                        docs/ZERNIO-INTEGRATION.md. */}
                    <div>
                      <span className="block text-sm font-medium text-text">Send to</span>
                      <div className="mt-1 inline-flex rounded-md border border-border-strong p-0.5">
                        {AUDIENCES.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setAudience(option.value)}
                            className={
                              audience === option.value
                                ? 'rounded-[5px] bg-accent px-3 py-1 text-xs font-semibold text-accent-ink'
                                : 'rounded-[5px] px-3 py-1 text-xs font-medium text-text-muted hover:text-text'
                            }
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                      <p className="mt-1 text-xs text-text-muted">
                        {AUDIENCES.find((option) => option.value === audience)?.hint}
                        {audience !== 'any' &&
                          ' Instagram only reveals this for people who have messaged you before; anyone else is still sent to.'}
                      </p>
                    </div>

                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-text">
                          Public reply on the comment (optional)
                        </span>
                        <Toggle
                          checked={replyEnabled}
                          onChange={() => setReplyEnabled(!replyEnabled)}
                          label="Enable public reply"
                        />
                      </div>
                      {replyEnabled && (
                        <>
                          <textarea
                            rows={2}
                            value={commentReply}
                            maxLength={AUTOMATION_LIMITS.commentReplyMax}
                            onChange={(e) => setCommentReply(e.target.value)}
                            placeholder="Thanks! Sent you a DM 🙌"
                            className="mt-2 block w-full rounded-md border border-border-strong bg-surface px-3 py-1.5 text-sm text-text"
                          />
                          <ReplySuggestions value={commentReply} onAppend={setCommentReply} />

                          {/* Requirement 13: up to 5 alternates on top of the reply above. */}
                          {replyVariations.length > 0 && (
                            <div className="mt-2 space-y-2">
                              {replyVariations.map((reply, index) => (
                                <div key={index} className="flex gap-2">
                                  <input
                                    type="text"
                                    value={reply}
                                    maxLength={AUTOMATION_LIMITS.commentReplyMax}
                                    onChange={(e) =>
                                      setReplyVariations(
                                        replyVariations.map((existing, i) =>
                                          i === index ? e.target.value : existing,
                                        ),
                                      )
                                    }
                                    placeholder={`Alternative reply ${index + 1}`}
                                    className="flex-1 rounded-md border border-border-strong bg-surface px-3 py-1.5 text-sm text-text"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setReplyVariations(
                                        replyVariations.filter((_, i) => i !== index),
                                      )
                                    }
                                    aria-label={`Remove alternative reply ${index + 1}`}
                                    className="px-1 text-text-faint hover:text-text"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          {replyVariations.length < MAX_REPLY_VARIATIONS && (
                            <button
                              type="button"
                              onClick={() => setReplyVariations([...replyVariations, ''])}
                              // Disabled until there is a primary reply: Zernio rotates over
                              // [commentReply, ...variations], so alternates with nothing to
                              // rotate against are rejected by the API.
                              disabled={commentReply.trim().length === 0}
                              className="mt-2 w-full rounded-md border border-dashed border-border-strong px-3 py-2 text-xs font-medium text-text-muted hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              + Add another reply ({MAX_REPLY_VARIATIONS - replyVariations.length}{' '}
                              left)
                            </button>
                          )}
                        </>
                      )}
                      <p className="mt-1 text-xs text-text-muted">
                        Posted publicly under the triggering comment. Leave the toggle off to skip a
                        public reply.
                        {replyEnabled && replyVariations.length > 0 && (
                          <>
                            {' '}
                            With alternatives added, Instagram shows{' '}
                            <strong className="font-medium">
                              one of them picked at random
                            </strong>{' '}
                            per comment - not all of them - so repeat commenters do not all see the
                            same wording.
                          </>
                        )}
                      </p>
                    </div>

                    <div className="border-t border-border pt-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-text">Enabled</span>
                        <Toggle
                          checked={isActive}
                          onChange={() => setIsActive(!isActive)}
                          label="Enable automation"
                        />
                      </div>
                      <p className="mt-1 text-xs text-text-muted">
                        {isActive
                          ? 'Starts replying to matching comments as soon as it is created.'
                          : 'Created but paused - it will not reply until you enable it.'}
                      </p>
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div>
                    <label htmlFor="dmMessage" className="block text-sm font-medium text-text">
                      DM message
                    </label>
                    {/* Capped at the *plain* limit, not `limit`: lowering maxLength to 640 while
                        text longer than that is already in the box would leave the field in a
                        state the user cannot see the end of. The counter turns red and Next
                        disables instead, which is recoverable. */}
                    <textarea
                      id="dmMessage"
                      rows={3}
                      value={dmMessage}
                      maxLength={AUTOMATION_LIMITS.dmMessageMax}
                      onChange={(e) => setDmMessage(e.target.value)}
                      className="mt-1 block w-full rounded-md border border-border-strong bg-surface px-3 py-1.5 text-sm text-text"
                    />
                    <p
                      className={`mt-1 text-right text-xs ${overLimit ? 'text-danger' : 'text-text-faint'}`}
                    >
                      {dmMessage.length} / {limit}
                      {buttons.length > 0 && ' — limit drops to 640 once a button is added'}
                    </p>

                    <div className="mt-3 flex items-baseline justify-between">
                      <span className="text-sm font-medium text-text">Buttons (optional)</span>
                      <span className="text-xs text-text-faint">
                        {buttons.length} / {MAX_BUTTONS} used
                      </span>
                    </div>
                    {buttons.length > 0 && (
                      <div className="mt-1.5 space-y-2">
                        {buttons.map((row) => (
                          <div key={row.key} className="flex gap-2">
                            <input
                              type="text"
                              value={row.title}
                              onChange={(e) => updateButton(row.key, 'title', e.target.value)}
                              maxLength={AUTOMATION_LIMITS.buttonTitleMax}
                              placeholder="Label (max 20 chars)"
                              className="w-32 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-text"
                            />
                            <input
                              type="text"
                              value={row.url}
                              onChange={(e) => updateButton(row.key, 'url', e.target.value)}
                              placeholder="https://..."
                              className="flex-1 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-text"
                            />
                            <button
                              type="button"
                              onClick={() => removeButton(row.key)}
                              aria-label="Remove button"
                              className="px-1 text-text-faint hover:text-text"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {buttons.length < MAX_BUTTONS && (
                      <button
                        type="button"
                        onClick={addButton}
                        className="mt-2 w-full rounded-md border border-dashed border-border-strong px-3 py-2 text-xs font-medium text-text-muted hover:bg-surface-2"
                      >
                        + Add button ({MAX_BUTTONS - buttons.length} left)
                      </button>
                    )}
                    <p className="mt-1 text-xs text-text-muted">
                      Up to 3 buttons, each a short label and a link, shown under the DM. Zernio
                      tracks clicks on each link automatically.
                    </p>

                    {(dmMessage || buttons.length > 0) && (
                      <div className="mt-4 overflow-hidden rounded-lg border border-border bg-muted-bg p-3">
                        <p className="mb-2 text-xs text-text-faint">Preview</p>
                        {/* whitespace-pre-wrap keeps the user's own line breaks; break-words
                            splits a long unbroken run (a pasted URL, a word with no spaces)
                            that would otherwise render as one line wider than the bubble and
                            overflow the modal. min-w-0 lets the bubble actually shrink inside
                            its flex/grid parent instead of being sized by its content. */}
                        <div className="min-w-0 whitespace-pre-wrap break-words rounded-2xl bg-surface px-3 py-2 text-sm text-text shadow-sm">
                          {dmMessage || '(your DM message)'}
                        </div>
                        {buttons.some((b) => b.title) && (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {buttons
                              .filter((b) => b.title)
                              .map((b) => (
                                <span
                                  key={b.key}
                                  className="max-w-full truncate rounded-full border border-border-strong px-2.5 py-1 text-xs font-medium text-text"
                                >
                                  {b.title}
                                </span>
                              ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {step === 3 && (
                  <div className="space-y-4 text-sm">
                    <ReviewRow label="When someone comments">
                      <p className="text-text">This post/reel</p>
                    </ReviewRow>
                    <ReviewRow
                      label={
                        triggerType === 'any' ? 'with any text at all' : 'and the comment matches'
                      }
                    >
                      {triggerType === 'any' ? (
                        <p className="text-text">Every comment triggers this automation</p>
                      ) : (
                        <>
                          <p className="text-text-faint">{matchMode}</p>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {keywords.map((keyword) => (
                              <span
                                key={keyword}
                                className="rounded-full bg-muted-bg px-2.5 py-0.5 text-xs font-medium text-text"
                              >
                                {keyword}
                              </span>
                            ))}
                          </div>
                        </>
                      )}
                    </ReviewRow>
                    {audience !== 'any' && (
                      <ReviewRow label="but only for">
                        <p className="text-text">
                          {AUDIENCES.find((option) => option.value === audience)?.label}
                        </p>
                      </ReviewRow>
                    )}
                    {replyEnabled && commentReply && (
                      <ReviewRow
                        label={
                          submittedVariations.length > 0
                            ? `reply publicly with one of these ${submittedVariations.length + 1}, at random`
                            : 'reply publicly with'
                        }
                      >
                        <p className="whitespace-pre-wrap break-words rounded-lg bg-muted-bg px-3 py-2 text-text">
                          &quot;{commentReply}&quot;
                        </p>
                        {submittedVariations.map((reply, index) => (
                          <p
                            key={index}
                            className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-muted-bg px-3 py-2 text-text"
                          >
                            &quot;{reply}&quot;
                          </p>
                        ))}
                      </ReviewRow>
                    )}
                    <ReviewRow label="and send this DM">
                      <p className="whitespace-pre-wrap break-words rounded-lg bg-muted-bg px-3 py-2 text-text">
                        {dmMessage}
                      </p>
                      {buttons.some((b) => b.title) && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {buttons
                            .filter((b) => b.title)
                            .map((b) => (
                              <span
                                key={b.key}
                                className="max-w-full truncate rounded-full border border-border-strong px-2.5 py-1 text-xs font-medium text-text"
                              >
                                {b.title}
                              </span>
                            ))}
                        </div>
                      )}
                    </ReviewRow>
                    {buttons.some((b) => b.url) && (
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
                          isActive
                            ? 'inline-block rounded-full border border-success-border bg-success-bg px-2.5 py-0.5 text-xs font-semibold text-success'
                            : 'inline-block rounded-full bg-muted-bg px-2.5 py-0.5 text-xs font-semibold text-text-faint'
                        }
                      >
                        {isActive ? 'Enabled' : 'Disabled'}
                      </span>
                    </ReviewRow>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-border px-4 py-3">
                <span className="text-xs text-text-faint">Step {step} of 3</span>
                <div className="flex gap-2">
                  {step === 1 ? (
                    // The backdrop no longer closes the dialog, so step 1 needs an explicit
                    // way out that is not just the small corner ✕.
                    <button
                      type="button"
                      onClick={close}
                      className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-text-muted hover:bg-surface-2"
                    >
                      Cancel
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setStep((step - 1) as 1 | 2 | 3)}
                      className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-text-muted hover:bg-surface-2"
                    >
                      Back
                    </button>
                  )}
                  {step < 3 ? (
                    <button
                      type="button"
                      onClick={() => setStep((step + 1) as 1 | 2 | 3)}
                      disabled={step === 1 ? !step1Valid : !step2Valid}
                      className="rounded-md bg-ink-950 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
                    >
                      Next
                    </button>
                  ) : (
                    // data-confirm is what onSubmit looks for: the only control permitted to
                    // actually submit the form.
                    <button
                      type="submit"
                      data-confirm="true"
                      className="rounded-md bg-ink-950 px-4 py-1.5 text-sm font-medium text-white"
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

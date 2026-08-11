'use client';

import { useState, type KeyboardEvent } from 'react';
import { FormPendingOverlay } from '../../../loader';
import { createAutomationAction } from './actions';

interface ButtonRow {
  key: number;
  title: string;
  url: string;
}

type MatchMode = 'contains' | 'word' | 'exact';

const MAX_BUTTONS = 3;
const LIMIT_WITH_BUTTONS = 640;
const LIMIT_PLAIN = 1000;

const MATCH_MODES: { value: MatchMode; label: string }[] = [
  { value: 'contains', label: 'Contains' },
  { value: 'word', label: 'Word' },
  { value: 'exact', label: 'Exact' },
];

// A 3-step modal wizard (trigger -> message -> review), matching the reference mockup's
// shape - replaces the older always-visible inline form (which folded KeywordsField and
// DmMessageField in separately) with one client component that owns all the form state, so
// the review step (step 3) can actually echo back what was entered in steps 1-2. Still
// submits through the exact same createAutomationAction server action and FormData contract -
// no backend change needed for this.
export function CreateAutomationModal({
  organizationId,
  accountId,
  postId,
}: {
  organizationId: string;
  accountId: string;
  postId: string;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [name, setName] = useState('');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordDraft, setKeywordDraft] = useState('');
  const [matchMode, setMatchMode] = useState<MatchMode>('contains');
  const [replyEnabled, setReplyEnabled] = useState(false);
  const [commentReply, setCommentReply] = useState('');

  const [dmMessage, setDmMessage] = useState('');
  const [buttons, setButtons] = useState<ButtonRow[]>([]);
  const [nextButtonKey, setNextButtonKey] = useState(0);

  const limit = buttons.length > 0 ? LIMIT_WITH_BUTTONS : LIMIT_PLAIN;
  const overLimit = dmMessage.length > limit;
  const step1Valid = name.trim().length > 0 && keywords.length > 0;
  const step2Valid = dmMessage.trim().length > 0 && !overLimit;

  function reset() {
    setStep(1);
    setName('');
    setKeywords([]);
    setKeywordDraft('');
    setMatchMode('contains');
    setReplyEnabled(false);
    setCommentReply('');
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
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/60 p-0 sm:items-center sm:p-6"
          onClick={close}
        >
          <div
            className="flex h-full w-full flex-col overflow-hidden bg-surface shadow-lg sm:h-auto sm:max-h-[85vh] sm:max-w-lg sm:rounded-xl sm:border sm:border-border"
            onClick={(e) => e.stopPropagation()}
          >
            <form action={createAutomationAction} className="flex min-h-0 flex-1 flex-col">
              {/* Inside the form on purpose - useFormStatus only reports on its nearest parent
                  form. This submit calls Zernio, so it is the slowest wait in the app. */}
              <FormPendingOverlay />
              {/* Every submitted value lives in a hidden field here, NOT in the visible
                  step-1/step-2 inputs. Those inputs are conditionally rendered, so React
                  unmounts them when the wizard advances - and an unmounted input is gone from
                  the DOM, so its value never reaches FormData. Submitting on step 3 therefore
                  used to send name/dmMessage/buttons as null, which the API rejected as
                  "invalid input" even though the visible form looked complete. Keeping the
                  canonical values here makes the submitted payload independent of which step
                  happens to be on screen. */}
              <input type="hidden" name="organizationId" value={organizationId} />
              <input type="hidden" name="accountId" value={accountId} />
              <input type="hidden" name="postId" value={postId} />
              <input type="hidden" name="name" value={name} />
              <input type="hidden" name="keywords" value={keywords.join(',')} />
              <input type="hidden" name="matchMode" value={matchMode} />
              <input type="hidden" name="commentReply" value={replyEnabled ? commentReply : ''} />
              <input type="hidden" name="dmMessage" value={dmMessage} />
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
                      <input
                        id="automation-name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="mt-1 block w-full rounded-md border border-border-strong bg-surface px-3 py-1.5 text-sm text-text"
                      />
                    </div>

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
                                onClick={() => setKeywords(keywords.filter((k) => k !== keyword))}
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
                        Any comment matching one of these triggers the automation. At least one is
                        required.
                      </p>
                    </div>

                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-text">
                          Public reply on the comment (optional)
                        </span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={replyEnabled}
                          onClick={() => setReplyEnabled(!replyEnabled)}
                          className={
                            replyEnabled
                              ? 'relative h-5 w-9 rounded-full bg-accent transition'
                              : 'relative h-5 w-9 rounded-full bg-muted-bg transition'
                          }
                        >
                          <span
                            className={
                              replyEnabled
                                ? 'absolute left-4 top-0.5 h-4 w-4 rounded-full bg-accent-ink transition'
                                : 'absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-surface transition'
                            }
                          />
                        </button>
                      </div>
                      {replyEnabled && (
                        <textarea
                          rows={2}
                          value={commentReply}
                          onChange={(e) => setCommentReply(e.target.value)}
                          placeholder="Thanks! Sent you a DM 🙌"
                          className="mt-2 block w-full rounded-md border border-border-strong bg-surface px-3 py-1.5 text-sm text-text"
                        />
                      )}
                      <p className="mt-1 text-xs text-text-muted">
                        Posted publicly under the triggering comment. Leave the toggle off to skip a
                        public reply.
                      </p>
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div>
                    <label htmlFor="dmMessage" className="block text-sm font-medium text-text">
                      DM message
                    </label>
                    <textarea
                      id="dmMessage"
                      rows={3}
                      value={dmMessage}
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
                              maxLength={20}
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
                      <div className="mt-4 rounded-lg border border-border bg-muted-bg p-3">
                        <p className="mb-2 text-xs text-text-faint">Preview</p>
                        <div className="rounded-2xl bg-surface px-3 py-2 text-sm text-text shadow-sm">
                          {dmMessage || '(your DM message)'}
                        </div>
                        {buttons.some((b) => b.title) && (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {buttons
                              .filter((b) => b.title)
                              .map((b) => (
                                <span
                                  key={b.key}
                                  className="rounded-full border border-border-strong px-2.5 py-1 text-xs font-medium text-text"
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
                    <ReviewRow label="and the comment matches">
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
                    </ReviewRow>
                    {replyEnabled && commentReply && (
                      <ReviewRow label="reply publicly with">
                        <p className="rounded-lg bg-muted-bg px-3 py-2 text-text">
                          &quot;{commentReply}&quot;
                        </p>
                      </ReviewRow>
                    )}
                    <ReviewRow label="and send this DM">
                      <p className="rounded-lg bg-muted-bg px-3 py-2 text-text">{dmMessage}</p>
                      {buttons.some((b) => b.title) && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {buttons
                            .filter((b) => b.title)
                            .map((b) => (
                              <span
                                key={b.key}
                                className="rounded-full border border-border-strong px-2.5 py-1 text-xs font-medium text-text"
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
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-border px-4 py-3">
                <span className="text-xs text-text-faint">Step {step} of 3</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setStep((step - 1) as 1 | 2 | 3)}
                    disabled={step === 1}
                    className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-text-muted disabled:opacity-40"
                  >
                    Back
                  </button>
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
                    <button
                      type="submit"
                      className="rounded-md bg-ink-950 px-4 py-1.5 text-sm font-medium text-white"
                    >
                      Confirm & create
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function ReviewRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="text-text-faint">↳</span>
      <div className="flex-1">
        <p className="text-xs text-text-muted">{label}</p>
        <div className="mt-1">{children}</div>
      </div>
    </div>
  );
}

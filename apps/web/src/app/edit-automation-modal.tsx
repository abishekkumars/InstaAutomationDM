'use client';

import { useState, type KeyboardEvent } from 'react';
import { AUTOMATION_LIMITS } from '@automationdm/validation';
import { FormPendingOverlay } from './loader';
import { Toggle } from './toggle';
import { ReplySuggestions } from './reply-suggestions';
import { PencilIcon, TrashIcon } from './icons';
import { updateAutomationAction, deleteAutomationAction } from './automation-actions';

export interface EditableAutomation {
  id: string;
  name: string;
  keywords: string[];
  matchMode: 'CONTAINS' | 'WORD' | 'EXACT';
  commentReply: string | null;
  buttons: { title: string; url: string }[];
  dmMessage: string;
  isActive: boolean;
}

interface ButtonRow {
  key: number;
  title: string;
  url: string;
}

type MatchMode = 'contains' | 'word' | 'exact';

// From packages/validation so the form and the schema cannot disagree - see AUTOMATION_LIMITS.
const MAX_BUTTONS = AUTOMATION_LIMITS.buttonsMax;
const LIMIT_WITH_BUTTONS = AUTOMATION_LIMITS.dmMessageWithButtonsMax;
const LIMIT_PLAIN = AUTOMATION_LIMITS.dmMessageMax;

const MATCH_MODES: { value: MatchMode; label: string }[] = [
  { value: 'contains', label: 'Contains' },
  { value: 'word', label: 'Word' },
  { value: 'exact', label: 'Exact' },
];

type TriggerKind = 'button' | 'link' | 'icon' | 'delete-icon';

const TRIGGER_CLASS: Record<TriggerKind, string> = {
  button:
    'rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-text-muted hover:bg-surface-2',
  link: 'text-xs font-medium text-text-muted hover:text-text hover:underline',
  icon: 'rounded-md p-1.5 text-text-muted hover:bg-muted-bg hover:text-text',
  'delete-icon': 'rounded-md p-1.5 text-text-muted hover:bg-danger-bg hover:text-danger',
};

// Edit + delete for an existing automation, used by both the post detail page and the
// dashboard table. Deliberately NOT a wizard like CreateAutomationModal: editing is usually a
// one-field change, so making the user page through three steps to alter a keyword would be
// worse than showing everything at once. It submits to updateAutomationAction (PATCH), which
// shares the create form's FormData conventions.
//
// The post binding is intentionally not editable - this project's model is one automation per
// post, so "move to a different post" is a delete-and-recreate, not an edit.
export function EditAutomationModal({
  organizationId,
  automation,
  redirectTo,
  trigger = 'button',
  openExternally = false,
  onExternalClose,
}: {
  organizationId: string;
  automation: EditableAutomation;
  /** Where to send the user after a successful save/delete - the page they started on. */
  redirectTo: string;
  /** How the opener renders: a bordered Edit button, a compact text link, a pencil icon, or a
   * trash icon that jumps straight to the delete confirmation. All four open the same dialog -
   * 'delete-icon' simply lands on the confirm step, so deleting never needs a detour through
   * the edit form. Ignored entirely when `openExternally` is used, which renders no trigger. */
  trigger?: TriggerKind;
  /** Opens the dialog from a parent-owned click instead of this component's own trigger, and
   * renders no trigger button at all. Used by the dashboard, where the clickable surface is the
   * table row / list item itself - a `<tr>` cannot be wrapped in this component's own element,
   * so the row owns the click and this owns the dialog. `onExternalClose` must clear whatever
   * parent state set it, or the dialog cannot be dismissed. */
  openExternally?: boolean;
  onExternalClose?: () => void;
}) {
  const [selfOpen, setSelfOpen] = useState(false);
  const open = openExternally || selfOpen;
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // The trash-icon trigger is delete-only: it never shows the edit form at all.
  const deleteOnly = trigger === 'delete-icon';

  const [name, setName] = useState(automation.name);
  const [keywords, setKeywords] = useState<string[]>(automation.keywords);
  const [keywordDraft, setKeywordDraft] = useState('');
  const [matchMode, setMatchMode] = useState<MatchMode>(
    automation.matchMode.toLowerCase() as MatchMode,
  );
  const [replyEnabled, setReplyEnabled] = useState(Boolean(automation.commentReply));
  const [commentReply, setCommentReply] = useState(automation.commentReply ?? '');
  const [dmMessage, setDmMessage] = useState(automation.dmMessage);
  const [isActive, setIsActive] = useState(automation.isActive);
  const [buttons, setButtons] = useState<ButtonRow[]>(
    automation.buttons.map((button, index) => ({ key: index, ...button })),
  );
  const [nextButtonKey, setNextButtonKey] = useState(automation.buttons.length);

  const limit = buttons.length > 0 ? LIMIT_WITH_BUTTONS : LIMIT_PLAIN;
  const overLimit = dmMessage.length > limit;
  const canSave = name.trim().length > 0 && keywords.length > 0 && dmMessage.trim().length > 0;

  // Restores the fields to what the server currently has, so cancelling genuinely discards
  // edits rather than leaving them staged for the next time the dialog opens.
  function close() {
    setSelfOpen(false);
    onExternalClose?.();
    setConfirmingDelete(false);
    setName(automation.name);
    setKeywords(automation.keywords);
    setKeywordDraft('');
    setMatchMode(automation.matchMode.toLowerCase() as MatchMode);
    setReplyEnabled(Boolean(automation.commentReply));
    setCommentReply(automation.commentReply ?? '');
    setDmMessage(automation.dmMessage);
    setIsActive(automation.isActive);
    setButtons(automation.buttons.map((button, index) => ({ key: index, ...button })));
    setNextButtonKey(automation.buttons.length);
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

  // Same guard as the create wizard: only the explicit Save button may submit, so Enter in a
  // text field can never save a half-finished edit.
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (submitter?.getAttribute('data-confirm') !== 'true') {
      event.preventDefault();
    }
  }

  return (
    <>
      {/* No trigger of its own in externally-opened mode - the parent owns the clickable
          surface. */}
      {!openExternally && (
        <button
          type="button"
          onClick={() => setSelfOpen(true)}
          title={deleteOnly ? 'Delete automation' : 'Edit automation'}
          aria-label={deleteOnly ? `Delete ${automation.name}` : `Edit ${automation.name}`}
          className={TRIGGER_CLASS[trigger]}
        >
          {trigger === 'delete-icon' ? <TrashIcon /> : trigger === 'icon' ? <PencilIcon /> : 'Edit'}
        </button>
      )}

      {open && (
        // No backdrop click-to-close, same reasoning as the create wizard: a stray click must
        // not silently discard an in-progress edit.
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/60 p-0 sm:items-center sm:p-6">
          {/* Delete-only mode: opened from the dashboard's trash icon, so there is no edit to
              perform. Rendering just the confirmation - rather than the edit form with a
              confirmation layered on top of it - keeps the intent unambiguous and stops the
              whole form flashing into view behind the prompt. */}
          {deleteOnly ? (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Delete automation"
              className="m-auto w-full max-w-sm rounded-xl border border-border bg-surface p-4 shadow-lg"
            >
              <DeleteConfirmation
                organizationId={organizationId}
                automation={automation}
                redirectTo={redirectTo}
                onCancel={close}
              />
            </div>
          ) : (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Edit automation"
              className="relative flex h-full w-full flex-col overflow-hidden bg-surface shadow-lg sm:h-auto sm:max-h-[85vh] sm:max-w-lg sm:rounded-xl sm:border sm:border-border"
            >
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <h2 className="flex-1 truncate text-sm font-semibold text-text">Edit automation</h2>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close"
                  className="text-text-faint hover:text-text"
                >
                  ✕
                </button>
              </div>

              <form
                action={updateAutomationAction}
                onSubmit={onSubmit}
                className="flex min-h-0 flex-1 flex-col"
              >
                <FormPendingOverlay />
                <input type="hidden" name="organizationId" value={organizationId} />
                <input type="hidden" name="automationId" value={automation.id} />
                <input type="hidden" name="redirectTo" value={redirectTo} />
                <input type="hidden" name="name" value={name} />
                <input type="hidden" name="keywords" value={keywords.join(',')} />
                <input type="hidden" name="matchMode" value={matchMode} />
                <input type="hidden" name="commentReply" value={replyEnabled ? commentReply : ''} />
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

                <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
                    <div className="min-w-0">
                      <span className="block text-sm font-medium text-text">Enabled</span>
                      <span className="text-xs text-text-muted">
                        {isActive
                          ? 'Replying to matching comments.'
                          : 'Paused - no replies or DMs are sent.'}
                      </span>
                    </div>
                    <Toggle
                      checked={isActive}
                      onChange={() => setIsActive(!isActive)}
                      label="Enable automation"
                    />
                  </div>

                  <div>
                    <label htmlFor="edit-name" className="block text-sm font-medium text-text">
                      Name
                    </label>
                    <input
                      id="edit-name"
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
                    <span className="block text-sm font-medium text-text">Keywords</span>
                    <div className="mt-1 flex gap-2">
                      <input
                        type="text"
                        value={keywordDraft}
                        onChange={(e) => setKeywordDraft(e.target.value)}
                        onKeyDown={onKeywordKeyDown}
                        placeholder="Type a keyword and press Enter"
                        className="min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-3 py-1.5 text-sm text-text"
                      />
                      <button
                        type="button"
                        onClick={addKeyword}
                        className="shrink-0 rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-text-muted hover:bg-surface-2"
                      >
                        + Add
                      </button>
                    </div>
                    {keywords.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {keywords.map((keyword) => (
                          <span
                            key={keyword}
                            className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-muted-bg px-2.5 py-1 text-xs font-medium text-text"
                          >
                            <span className="truncate">{keyword}</span>
                            <button
                              type="button"
                              onClick={() => setKeywords(keywords.filter((k) => k !== keyword))}
                              aria-label={`Remove ${keyword}`}
                              className="shrink-0 text-text-faint hover:text-text"
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-text">
                        Public reply on the comment
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
                      </>
                    )}
                    <p className="mt-1 text-xs text-text-muted">
                      Turning this off clears the public reply.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="edit-dm" className="block text-sm font-medium text-text">
                      DM message
                    </label>
                    <textarea
                      id="edit-dm"
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
                    </p>
                  </div>

                  <div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-medium text-text">Buttons</span>
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
                              onChange={(e) =>
                                setButtons(
                                  buttons.map((b) =>
                                    b.key === row.key ? { ...b, title: e.target.value } : b,
                                  ),
                                )
                              }
                              maxLength={AUTOMATION_LIMITS.buttonTitleMax}
                              placeholder="Label"
                              className="w-32 shrink-0 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-text"
                            />
                            <input
                              type="text"
                              value={row.url}
                              onChange={(e) =>
                                setButtons(
                                  buttons.map((b) =>
                                    b.key === row.key ? { ...b, url: e.target.value } : b,
                                  ),
                                )
                              }
                              placeholder="https://..."
                              className="min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-text"
                            />
                            <button
                              type="button"
                              onClick={() => setButtons(buttons.filter((b) => b.key !== row.key))}
                              aria-label="Remove button"
                              className="shrink-0 px-1 text-text-faint hover:text-text"
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
                        onClick={() => {
                          setButtons([...buttons, { key: nextButtonKey, title: '', url: '' }]);
                          setNextButtonKey(nextButtonKey + 1);
                        }}
                        className="mt-2 w-full rounded-md border border-dashed border-border-strong px-3 py-2 text-xs font-medium text-text-muted hover:bg-surface-2"
                      >
                        + Add button ({MAX_BUTTONS - buttons.length} left)
                      </button>
                    )}
                    {buttons.length > 0 && overLimit && (
                      <p className="mt-1 text-xs text-danger">
                        With buttons attached the DM message must be 640 characters or fewer.
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(true)}
                    className="text-sm font-medium text-danger hover:underline"
                  >
                    Delete
                  </button>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={close}
                      className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-text-muted hover:bg-surface-2"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      data-confirm="true"
                      disabled={!canSave || overLimit}
                      className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-accent-ink hover:opacity-90 disabled:opacity-40"
                    >
                      Save changes
                    </button>
                  </div>
                </div>
              </form>

              {confirmingDelete && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-ink-950/60 p-4">
                  <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-4 shadow-lg">
                    <DeleteConfirmation
                      organizationId={organizationId}
                      automation={automation}
                      redirectTo={redirectTo}
                      onCancel={() => setConfirmingDelete(false)}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}

/** Deleting removes the automation from Zernio permanently, along with its trigger logs, and
 * stops DMs going out - worth an explicit confirmation rather than a single click. Extracted so
 * the delete-only dialog (dashboard trash icon) and the in-form overlay (edit dialog's Delete
 * button) share one implementation. */
function DeleteConfirmation({
  organizationId,
  automation,
  redirectTo,
  onCancel,
}: {
  organizationId: string;
  automation: EditableAutomation;
  redirectTo: string;
  onCancel: () => void;
}) {
  return (
    <>
      <h3 className="text-sm font-semibold text-text">Delete this automation?</h3>
      <p className="mt-1.5 text-sm break-words text-text-muted">
        <span className="font-medium text-text">{automation.name}</span> will stop replying to
        comments and sending DMs. This deletes it from Zernio permanently, including its trigger
        history, and cannot be undone.
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-text-muted hover:bg-surface-2"
        >
          Keep it
        </button>
        {/* Its own form: nesting a second <form> inside the edit form would be invalid HTML, and
            this one posts to a different action. */}
        <form action={deleteAutomationAction}>
          <FormPendingOverlay />
          <input type="hidden" name="organizationId" value={organizationId} />
          <input type="hidden" name="automationId" value={automation.id} />
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <button
            type="submit"
            className="rounded-md bg-danger px-4 py-1.5 text-sm font-medium text-white hover:opacity-90"
          >
            Delete permanently
          </button>
        </form>
      </div>
    </>
  );
}

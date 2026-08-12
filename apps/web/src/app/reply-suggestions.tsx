'use client';

import { AUTOMATION_LIMITS } from '@automationdm/validation';

/** Ready-made public replies, offered as one-tap chips under the comment-reply field.
 *
 * The public reply is posted under the triggering comment, visible to everyone - so its job is
 * to acknowledge the commenter and point at the DM without repeating the DM's content. These
 * three cover the situations that actually come up.
 */
export const REPLY_SUGGESTIONS = [
  'Thanks! Sent you a DM 🙌',
  'Just messaged you the details 💬',
  'Check your inbox 📩',
] as const;

/** Appends a suggestion to whatever is already in the field rather than replacing it, so two
 * can be combined - and so a click never silently destroys text the user typed. Separated by a
 * space only when there is existing content to separate from. */
export function ReplySuggestions({
  value,
  onAppend,
}: {
  value: string;
  onAppend: (next: string) => void;
}) {
  function append(suggestion: string) {
    const base = value.trimEnd();
    const next = base.length === 0 ? suggestion : `${base} ${suggestion}`;
    // Respect the same cap the textarea and the schema enforce - appending must not be a way
    // around the limit.
    onAppend(next.slice(0, AUTOMATION_LIMITS.commentReplyMax));
  }

  return (
    <div className="mt-2">
      <span className="text-xs text-text-faint">Suggestions</span>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {REPLY_SUGGESTIONS.map((suggestion) => {
          const alreadyUsed = value.includes(suggestion);
          return (
            <button
              key={suggestion}
              type="button"
              onClick={() => append(suggestion)}
              disabled={alreadyUsed}
              title={alreadyUsed ? 'Already added' : `Add "${suggestion}"`}
              className="max-w-full truncate rounded-full border border-border-strong px-2.5 py-1 text-xs font-medium text-text-muted hover:bg-surface-2 hover:text-text disabled:opacity-40 disabled:hover:bg-transparent"
            >
              + {suggestion}
            </button>
          );
        })}
      </div>
    </div>
  );
}

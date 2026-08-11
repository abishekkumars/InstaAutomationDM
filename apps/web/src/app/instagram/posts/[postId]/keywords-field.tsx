'use client';

import { useState, type KeyboardEvent } from 'react';

// The one client component in this app's form flow (every other form is a plain server
// action + FormData, per the note this replaces in actions.ts) - a chip input is genuinely
// easier to type multiple keywords into than a raw comma-separated text field, and the only
// way to get one without introducing a client component. It still submits through the exact
// same server action: the hidden input below carries the same comma-joined string
// createAutomationAction already parses, so no action/API change was needed for this.
export function KeywordsField() {
  const [keywords, setKeywords] = useState<string[]>([]);
  const [draft, setDraft] = useState('');

  function addKeyword() {
    const value = draft.trim();
    if (value.length === 0 || keywords.includes(value)) {
      setDraft('');
      return;
    }
    setKeywords([...keywords, value]);
    setDraft('');
  }

  function removeKeyword(value: string) {
    setKeywords(keywords.filter((k) => k !== value));
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addKeyword();
    }
  }

  return (
    <div>
      <label htmlFor="keyword-draft" className="block text-sm font-medium text-text">
        Keywords
      </label>
      <input type="hidden" name="keywords" value={keywords.join(',')} />
      <div className="mt-1 flex gap-2">
        <input
          id="keyword-draft"
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
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
                onClick={() => removeKeyword(keyword)}
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
  );
}

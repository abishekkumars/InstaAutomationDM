'use client';

import { useState } from 'react';

interface ButtonRow {
  key: number;
  title: string;
  url: string;
}

const MAX_BUTTONS = 3;
const LIMIT_WITH_BUTTONS = 640;
const LIMIT_PLAIN = 1000;

// DM message + buttons together in one client component (not two separate ones, unlike
// KeywordsField) because the message's real character limit depends on whether any buttons
// are attached - Zernio's own rule (docs/ZERNIO-INTEGRATION.md): 640 chars once buttons are
// added, ~1000 otherwise. The two fields have to share state to show that limit live.
export function DmMessageField() {
  const [dmMessage, setDmMessage] = useState('');
  const [buttons, setButtons] = useState<ButtonRow[]>([]);
  const [nextKey, setNextKey] = useState(0);

  const limit = buttons.length > 0 ? LIMIT_WITH_BUTTONS : LIMIT_PLAIN;
  const overLimit = dmMessage.length > limit;

  function addButton() {
    if (buttons.length >= MAX_BUTTONS) return;
    setButtons([...buttons, { key: nextKey, title: '', url: '' }]);
    setNextKey(nextKey + 1);
  }

  function removeButton(key: number) {
    setButtons(buttons.filter((b) => b.key !== key));
  }

  function updateButton(key: number, field: 'title' | 'url', value: string) {
    setButtons(buttons.map((b) => (b.key === key ? { ...b, [field]: value } : b)));
  }

  return (
    <div>
      <label htmlFor="dmMessage" className="block text-sm font-medium text-text">
        DM message
      </label>
      <textarea
        id="dmMessage"
        name="dmMessage"
        required
        rows={3}
        value={dmMessage}
        onChange={(e) => setDmMessage(e.target.value)}
        className="mt-1 block w-full rounded-md border border-border-strong bg-surface px-3 py-1.5 text-sm text-text"
      />
      <p className={`mt-1 text-right text-xs ${overLimit ? 'text-danger' : 'text-text-faint'}`}>
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
                name="buttonTitle"
                value={row.title}
                onChange={(e) => updateButton(row.key, 'title', e.target.value)}
                maxLength={20}
                placeholder="Label (max 20 chars)"
                className="w-36 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-text"
              />
              <input
                type="text"
                name="buttonUrl"
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
          + Add button
        </button>
      )}
      <p className="mt-1 text-xs text-text-muted">
        Up to 3 buttons, each a short label and a link, shown under the DM. Zernio tracks clicks on
        each link automatically.
      </p>
    </div>
  );
}

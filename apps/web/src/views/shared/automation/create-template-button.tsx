'use client';

import { useState } from 'react';
import { TemplateEditorDialog } from './template-editor';

/** Opens the template editor in create mode. Three looks: the desktop header button, the round
 * + in the mobile page header, and a full-width button for the mobile empty state. */
export function CreateTemplateButton({
  appearance,
  isFirstTemplate,
}: {
  appearance: 'desktop' | 'mobile-icon' | 'mobile-block';
  isFirstTemplate: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {appearance === 'mobile-icon' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Create template"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-accent text-accent-ink"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={
            appearance === 'mobile-block'
              ? 'h-[52px] w-full rounded-2xl bg-accent text-[15px] font-bold text-accent-ink'
              : 'shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:opacity-90'
          }
        >
          {appearance === 'mobile-block' ? 'Create template' : '+ Create template'}
        </button>
      )}
      {open && (
        <TemplateEditorDialog
          variant={appearance === 'desktop' ? 'desktop' : 'mobile'}
          isFirstTemplate={isFirstTemplate}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

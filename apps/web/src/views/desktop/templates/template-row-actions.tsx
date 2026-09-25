'use client';

import { useState, type ReactNode } from 'react';
import { cloneTemplateAction, setDefaultTemplateAction } from '@/app/templates/actions';
import type { AutomationTemplate } from '@/app/templates/templates-data';
import { CopyIcon, PencilIcon, TrashIcon } from '@/views/shared/icons';
import { LoadingOverlay } from '@/views/shared/loader';
import {
  DeleteTemplateDialog,
  TemplateEditorDialog,
} from '@/views/shared/automation/template-editor';
import { useTemplateAction } from '@/views/shared/automation/use-template-action';

/** Set default / Edit / Clone / Delete for one row of the desktop Templates table, on one line.
 * Edit, Clone and Delete are icon buttons with a tooltip. "Set default" stays a text button:
 * it is the one action whose meaning an icon would not make obvious. It is absent on the default
 * row itself, because the tag can only move, never be removed. */
export function TemplateRowActions({
  template,
  successorName,
}: {
  template: AutomationTemplate;
  successorName: string | null;
}) {
  const [dialog, setDialog] = useState<'edit' | 'delete' | null>(null);
  const { pending, run } = useTemplateAction();

  return (
    <div className="flex flex-nowrap items-center justify-end gap-1">
      {pending && <LoadingOverlay />}
      {!template.isDefault && (
        <button
          type="button"
          className="mr-1 rounded-md border border-border-strong px-2.5 py-1 text-xs font-medium whitespace-nowrap text-text-muted hover:bg-surface-2 hover:text-text"
          onClick={() =>
            run(() => setDefaultTemplateAction(template.id), {
              status: 'default',
              message: `"${template.name}" is now the default template.`,
            })
          }
        >
          Set default
        </button>
      )}
      <IconAction tooltip="Edit" label={`Edit ${template.name}`} onClick={() => setDialog('edit')}>
        <PencilIcon />
      </IconAction>
      <IconAction
        tooltip="Clone"
        label={`Clone ${template.name}`}
        onClick={() => run(() => cloneTemplateAction(template.id), { status: 'cloned' })}
      >
        <CopyIcon />
      </IconAction>
      <IconAction
        tooltip="Delete"
        label={`Delete ${template.name}`}
        danger
        onClick={() => setDialog('delete')}
      >
        <TrashIcon />
      </IconAction>

      {dialog === 'edit' && (
        <TemplateEditorDialog
          template={template}
          variant="desktop"
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'delete' && (
        <DeleteTemplateDialog
          template={template}
          successorName={successorName}
          variant="desktop"
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

/** An icon-only button with a tooltip above it. The tooltip shows on hover and on keyboard focus,
 * unlike a native `title`, which is slow to appear and never shows on focus. It is decorative
 * (`aria-hidden`): the accessible name comes from `aria-label`, which also names the template, so
 * a screen reader hears "Delete Price enquiry" rather than three identical "Delete"s. */
function IconAction({
  tooltip,
  label,
  danger = false,
  onClick,
  children,
}: {
  tooltip: string;
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className={`rounded-md p-1.5 text-text-muted hover:bg-muted-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
          danger ? 'hover:text-danger' : 'hover:text-text'
        }`}
      >
        {children}
      </button>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 rounded-md bg-ink-950 px-2 py-1 text-[11px] font-medium whitespace-nowrap text-white opacity-0 shadow-lg transition-opacity delay-150 group-hover:opacity-100 group-has-[:focus-visible]:opacity-100"
      >
        {tooltip}
      </span>
    </span>
  );
}

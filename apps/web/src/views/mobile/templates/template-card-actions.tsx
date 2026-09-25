'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { cloneTemplateAction, setDefaultTemplateAction } from '@/app/templates/actions';
import type { AutomationTemplate } from '@/app/templates/templates-data';
import { LoadingOverlay } from '@/views/shared/loader';
import {
  DeleteTemplateDialog,
  TemplateEditorDialog,
} from '@/views/shared/automation/template-editor';
import { useTemplateAction } from '@/views/shared/automation/use-template-action';
import { CopyIcon, EditIcon, MoreIcon, StarIcon, TrashIcon } from '../icons';

/** The ⋯ button on a mobile template card and the action sheet it opens: Edit, Clone, Set as
 * default and Delete. Edit and Delete swap the sheet for their own sheet rather than stacking
 * one on top of the other. */
export function TemplateCardActions({
  template,
  successorName,
}: {
  template: AutomationTemplate;
  successorName: string | null;
}) {
  const [open, setOpen] = useState<'menu' | 'edit' | 'delete' | null>(null);
  const { pending, run } = useTemplateAction();
  const close = () => setOpen(null);

  // Escape closes the menu, like the other sheets. Only bound while it is showing.
  useEffect(() => {
    if (open !== 'menu') return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(null);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen('menu')}
        aria-label={`Actions for ${template.name}`}
        aria-haspopup="dialog"
        className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-xl bg-seg text-text"
      >
        <MoreIcon size={20} />
      </button>

      {pending && <LoadingOverlay />}

      {open === 'menu' && (
        <div data-variant="mobile" className="fixed inset-0 z-50 flex items-end">
          {/* Backdrop click closes: the menu holds no typed input to lose. */}
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            className="absolute inset-0 h-full w-full cursor-default bg-ink-950/45"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Actions for ${template.name}`}
            className="relative flex w-full flex-col gap-2.5 rounded-t-[28px] border-t border-glass-border bg-surface px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-glass"
          >
            <span
              aria-hidden="true"
              className="mx-auto mt-2.5 h-[5px] w-10 shrink-0 rounded-full bg-switch-off"
            />
            <h2 className="truncate px-1 pt-1 text-[17px] font-extrabold text-text">
              {template.name}
            </h2>
            <div className="flex flex-col overflow-hidden rounded-[18px] border border-border bg-surface-2 [&>*+*]:border-t [&>*+*]:border-border">
              <SheetItem icon={<EditIcon size={20} />} onClick={() => setOpen('edit')}>
                Edit
              </SheetItem>
              <SheetItem
                icon={<CopyIcon size={20} />}
                onClick={() =>
                  run(() => cloneTemplateAction(template.id), { status: 'cloned', onDone: close })
                }
              >
                Clone
              </SheetItem>
              <SheetItem
                icon={<StarIcon size={20} />}
                disabled={template.isDefault}
                detail={template.isDefault ? 'Already the default' : undefined}
                onClick={() =>
                  run(() => setDefaultTemplateAction(template.id), {
                    status: 'default',
                    message: `"${template.name}" is now the default template.`,
                    onDone: close,
                  })
                }
              >
                Set as default
              </SheetItem>
              <SheetItem icon={<TrashIcon size={20} />} danger onClick={() => setOpen('delete')}>
                Delete
              </SheetItem>
            </div>
            <button
              type="button"
              onClick={close}
              className="h-[52px] rounded-2xl border border-border bg-surface text-[15px] font-bold text-text"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {open === 'edit' && (
        <TemplateEditorDialog template={template} variant="mobile" onClose={close} />
      )}
      {open === 'delete' && (
        <DeleteTemplateDialog
          template={template}
          successorName={successorName}
          variant="mobile"
          onClose={close}
        />
      )}
    </>
  );
}

function SheetItem({
  icon,
  detail,
  danger = false,
  disabled = false,
  onClick,
  children,
}: {
  icon: ReactNode;
  detail?: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-3 px-4 py-[15px] text-left text-[15px] font-bold disabled:text-text-faint ${
        danger ? 'text-danger' : 'text-text'
      }`}
    >
      {icon}
      <span className="flex-1">{children}</span>
      {detail && <span className="text-xs font-medium text-text-faint">{detail}</span>}
    </button>
  );
}

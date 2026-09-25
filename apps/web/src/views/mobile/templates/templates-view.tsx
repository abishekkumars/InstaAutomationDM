import { ApiError } from '@/lib/api';
import { getTemplates } from '@/app/templates/templates-data';
import { CreateTemplateButton } from '@/views/shared/automation/create-template-button';
import { successorName, templateMetaLine } from '@/views/shared/automation/template-summary';
import { MobileNotice } from '../notice';
import { MobilePageHeader } from '../page-header';
import { TemplateCardActions } from './template-card-actions';

/** The mobile Templates tab (Phase 19): one card per template, oldest first, with the default
 * tagged. The header's + creates a template; each card's ⋯ opens Edit, Clone, Set as default and
 * Delete. */
export async function MobileTemplatesView({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  const result = await getTemplates(organizationId).then(
    (templates) => ({ ok: true as const, templates }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  const count = result.ok ? result.templates.length : 0;
  const createButton =
    result.ok && count > 0 ? (
      <CreateTemplateButton appearance="mobile-icon" isFirstTemplate={false} />
    ) : undefined;

  return (
    <div className="flex flex-col gap-3">
      <MobilePageHeader
        title="Templates"
        eyebrow={organizationName}
        compactSubtitle={result.ok ? `${count} saved` : undefined}
        trailing={createButton}
        compactTrailing={createButton}
      />

      {!result.ok ? (
        <MobileNotice tone="warning" title="Could not load templates">
          {result.error instanceof ApiError ? result.error.message : 'API not reachable.'}
        </MobileNotice>
      ) : count === 0 ? (
        <section className="flex flex-col items-center gap-2.5 rounded-[24px] border border-border bg-surface px-[18px] py-7 text-center shadow-card">
          <h2 className="text-[17px] font-extrabold text-text">No templates yet</h2>
          <p className="text-sm leading-5 text-text-muted">
            Save the keywords, replies and DM you use most. Your first template becomes the default
            for every new automation.
          </p>
          <div className="mt-1.5 w-full">
            <CreateTemplateButton appearance="mobile-block" isFirstTemplate />
          </div>
        </section>
      ) : (
        result.templates.map((template) => (
          <article
            key={template.id}
            className="flex flex-col gap-2.5 rounded-[22px] border border-border bg-surface px-4 py-3.5 shadow-card"
          >
            <div className="flex items-start gap-2.5">
              <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
                <h2 className="max-w-full text-base font-extrabold break-words text-text">
                  {template.name}
                </h2>
                {template.isDefault && (
                  <span className="inline-flex rounded-full border border-success-border bg-success-bg px-2 py-0.5 text-[11px] font-bold text-success">
                    Default
                  </span>
                )}
              </div>
              <TemplateCardActions
                template={template}
                successorName={successorName(result.templates, template)}
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {template.triggerType === 'any' ? (
                <Chip tone="any">Any comment</Chip>
              ) : template.keywords.length === 0 ? (
                <Chip tone="any">No keywords yet</Chip>
              ) : (
                template.keywords.map((keyword) => <Chip key={keyword}>{keyword}</Chip>)
              )}
            </div>

            {template.dmMessage && (
              <p className="line-clamp-2 rounded-[16px] rounded-bl-md bg-seg px-3 py-2.5 text-[13.5px] leading-snug break-words text-text">
                {template.dmMessage}
              </p>
            )}

            <p className="text-[12.5px] text-text-muted">{templateMetaLine(template)}</p>
          </article>
        ))
      )}
    </div>
  );
}

function Chip({ children, tone = 'keyword' }: { children: string; tone?: 'keyword' | 'any' }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[12.5px] font-bold ${
        tone === 'any' ? 'bg-accent-2-soft text-accent-2' : 'bg-accent-soft text-accent'
      }`}
    >
      {children}
    </span>
  );
}

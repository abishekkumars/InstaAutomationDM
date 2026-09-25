import { ApiError } from '@/lib/api';
import { getTemplates } from '@/app/templates/templates-data';
import { CreateTemplateButton } from '@/views/shared/automation/create-template-button';
import {
  audienceLabel,
  successorName,
  templateMetaLine,
} from '@/views/shared/automation/template-summary';
import { TemplateRowActions } from './template-row-actions';

/** The desktop Templates page (Phase 19): every template in the organization, oldest first,
 * with the default tagged. The route has already resolved the active organization. */
export async function DesktopTemplatesView({
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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Templates</h1>
          <p className="mt-1 max-w-2xl text-sm text-text-muted">
            Saved starting points for new automations. The default template fills in the create
            popup automatically. Everyone in {organizationName} can use and change these.
          </p>
        </div>
        {result.ok && result.templates.length > 0 && (
          <CreateTemplateButton appearance="desktop" isFirstTemplate={false} />
        )}
      </div>

      {!result.ok ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">
          <p className="font-medium">Could not load templates</p>
          <p className="mt-1 text-sm">
            {result.error instanceof ApiError ? result.error.message : 'API not reachable.'}
          </p>
        </div>
      ) : result.templates.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border-strong bg-surface px-6 py-12 text-center">
          <h2 className="text-base font-semibold text-text">No templates yet</h2>
          <p className="max-w-md text-sm text-text-muted">
            Save the keywords, replies and DM you use most. Your first template becomes the default,
            and every new automation starts from it.
          </p>
          <CreateTemplateButton appearance="desktop" isFirstTemplate />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <table className="w-full table-fixed text-left text-sm">
            <thead className="bg-surface-2 text-[11.5px] font-bold tracking-[0.05em] text-text-faint uppercase">
              <tr>
                <th scope="col" className="w-[26%] px-4 py-2.5">
                  Template
                </th>
                <th scope="col" className="w-[22%] px-4 py-2.5">
                  Trigger
                </th>
                <th scope="col" className="hidden w-[12%] px-4 py-2.5 xl:table-cell">
                  Send to
                </th>
                <th scope="col" className="hidden px-4 py-2.5 lg:table-cell">
                  DM message
                </th>
                <th scope="col" className="w-[200px] px-4 py-2.5 text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {result.templates.map((template) => (
                <tr key={template.id} className="align-middle">
                  <td className="px-4 py-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold break-words text-text">{template.name}</span>
                      {template.isDefault && <DefaultTag />}
                    </div>
                    <p className="mt-1 text-xs text-text-faint">{templateMetaLine(template)}</p>
                  </td>
                  <td className="px-4 py-3.5 text-text-muted">
                    {template.triggerType === 'any' ? (
                      'Any comment'
                    ) : template.keywords.length === 0 ? (
                      <em className="text-text-faint">No keywords yet</em>
                    ) : (
                      <>
                        <div className="flex flex-wrap gap-1">
                          {template.keywords.slice(0, 3).map((keyword) => (
                            <span
                              key={keyword}
                              className="rounded-full bg-muted-bg px-2 py-0.5 text-xs text-text"
                            >
                              {keyword}
                            </span>
                          ))}
                          {template.keywords.length > 3 && (
                            <span className="rounded-full bg-muted-bg px-2 py-0.5 text-xs text-text">
                              +{template.keywords.length - 3}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs">{template.matchMode}</p>
                      </>
                    )}
                  </td>
                  <td className="hidden px-4 py-3.5 text-text-muted xl:table-cell">
                    {audienceLabel(template)}
                  </td>
                  {/* Hidden on narrower screens, like "Send to" above: the table would otherwise
                      squeeze the DM into a column a few characters wide. */}
                  <td className="hidden px-4 py-3.5 text-text-muted lg:table-cell">
                    {template.dmMessage ? (
                      <span className="block truncate">{template.dmMessage}</span>
                    ) : (
                      <em className="text-text-faint">Not set, filled in per post</em>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <TemplateRowActions
                      template={template}
                      successorName={successorName(result.templates, template)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DefaultTag() {
  return (
    <span className="inline-flex items-center rounded-full border border-success-border bg-success-bg px-2 py-0.5 text-[11px] font-bold tracking-[0.02em] text-success">
      Default
    </span>
  );
}

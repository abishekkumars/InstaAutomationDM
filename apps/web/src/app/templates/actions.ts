'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { ApiError, callApi } from '@/lib/api';
import { cacheTags } from '@/lib/cache-tags';
import { getActiveOrganizationId } from '@/lib/organization';

// Template actions (Phase 19). They return a result instead of redirecting, unlike the automation
// actions. Every template control sits in a dialog or sheet whose open state is client state, and
// a redirect back to the same /templates route keeps that state, so the dialog would stay open
// over the refreshed page. The caller closes it on success and shows the toast itself
// (views/shared/automation/use-template-action.ts). On failure the dialog stays open with what
// the user typed, next to the reason.
//
// The organization always comes from the session's active organization, never from the form.
// apps/api re-checks membership and that the template belongs to that organization anyway.

export type TemplateActionResult = { ok: true } | { ok: false; message: string };

const GENERIC_ERROR = 'That change could not be saved. Please try again.';

async function run(
  request: (organizationId: string) => Promise<unknown>,
): Promise<TemplateActionResult> {
  const organizationId = await getActiveOrganizationId().catch(() => null);
  if (!organizationId) {
    return { ok: false, message: 'No organization is selected.' };
  }
  try {
    await request(organizationId);
  } catch (error) {
    console.error('[templates] action failed:', error);
    // apps/api's 400/404 messages are written for the user ("Template name is required.",
    // "Template not found."). Anything else could leak internals, so it gets the generic text.
    const message =
      error instanceof ApiError && error.status >= 400 && error.status < 500
        ? error.message
        : GENERIC_ERROR;
    return { ok: false, message };
  }
  revalidateTag(cacheTags.templates(organizationId), { expire: 0 });
  revalidatePath('/templates');
  return { ok: true };
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 64;
}

function path(organizationId: string, templateId?: string, suffix = ''): string {
  const root = `/api/organizations/${organizationId}/automation-templates`;
  return templateId ? `${root}/${encodeURIComponent(templateId)}${suffix}` : root;
}

/** Creates a template, or replaces one when `templateId` is present. Reads the same field names
 * the create popup submits (see AutomationHiddenInputs), plus `triggerType`. */
export async function saveTemplateAction(formData: FormData): Promise<TemplateActionResult> {
  const templateId = formData.get('templateId');
  if (templateId !== null && !isId(templateId)) {
    return { ok: false, message: GENERIC_ERROR };
  }

  const keywordsRaw = formData.get('keywords');
  const titles = formData.getAll('buttonTitle').map(String);
  const urls = formData.getAll('buttonUrl').map(String);
  const body = {
    name: formData.get('name'),
    triggerType: formData.get('triggerType') === 'any' ? 'any' : 'keywords',
    keywords:
      typeof keywordsRaw === 'string'
        ? keywordsRaw
            .split(',')
            .map((keyword) => keyword.trim())
            .filter((keyword) => keyword.length > 0)
        : [],
    matchMode: formData.get('matchMode') ?? 'contains',
    audience: formData.get('audience') ?? 'any',
    commentReply: formData.get('commentReply') ?? '',
    commentReplyVariations: formData
      .getAll('commentReplyVariation')
      .map((reply) => String(reply).trim())
      .filter((reply) => reply.length > 0),
    dmMessage: formData.get('dmMessage') ?? '',
    // Paired by position, the same convention as createAutomationAction.
    buttons: titles
      .map((title, index) => ({ title: title.trim(), url: (urls[index] ?? '').trim() }))
      .filter((button) => button.title.length > 0 && button.url.length > 0),
    isActive: formData.get('isActive') !== 'false',
  };

  return run((organizationId) =>
    callApi(path(organizationId, templateId ?? undefined), {
      method: templateId ? 'PUT' : 'POST',
      body: JSON.stringify(body),
    }),
  );
}

export async function setDefaultTemplateAction(templateId: unknown): Promise<TemplateActionResult> {
  if (!isId(templateId)) return { ok: false, message: GENERIC_ERROR };
  return run((organizationId) =>
    callApi(path(organizationId, templateId, '/default'), { method: 'POST' }),
  );
}

export async function cloneTemplateAction(templateId: unknown): Promise<TemplateActionResult> {
  if (!isId(templateId)) return { ok: false, message: GENERIC_ERROR };
  return run((organizationId) =>
    callApi(path(organizationId, templateId, '/clone'), { method: 'POST' }),
  );
}

export async function deleteTemplateAction(templateId: unknown): Promise<TemplateActionResult> {
  if (!isId(templateId)) return { ok: false, message: GENERIC_ERROR };
  return run((organizationId) => callApi(path(organizationId, templateId), { method: 'DELETE' }));
}

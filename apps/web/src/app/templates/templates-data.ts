import { cache } from 'react';
import { callApiCached } from '@/lib/api';
import { cacheTags } from '@/lib/cache-tags';

/** An organization-wide automation template (Phase 19), as apps/api returns it.
 *
 * The enum fields already use the create popup's own lowercase values, so a template feeds the
 * form directly and the editor sends the same shape back. Client components import this type
 * with `import type` only; nothing else in this module may reach the browser. */
export interface AutomationTemplate {
  id: string;
  name: string;
  triggerType: 'keywords' | 'any';
  keywords: string[];
  matchMode: 'contains' | 'word' | 'exact';
  audience: 'any' | 'follower' | 'non_follower';
  commentReply: string | null;
  commentReplyVariations: string[];
  dmMessage: string | null;
  buttons: { title: string; url: string }[];
  isActive: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/** The organization's templates, oldest first. Shared by the Templates page and both post
 * detail views, which hand them to the create popup. Cached like the other org reads and
 * invalidated by every template action (app/templates/actions.ts). */
export const getTemplates = cache((organizationId: string) =>
  callApiCached<AutomationTemplate[]>(`/api/organizations/${organizationId}/automation-templates`, {
    tags: [cacheTags.templates(organizationId)],
  }),
);

import { callApi } from '@/lib/api';

/** Shared by the desktop and mobile post detail views (docs/ADR/0010-device-specific-views.md). */
export interface InstagramPostDetail {
  /** Instagram's own media id - the pivot since Phase 17, and what the post route keys on. */
  platformPostId: string;
  permalink: string | null;
  caption: string;
  mediaType: 'image' | 'video' | 'gif' | 'document' | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
}

export interface AutomationSummary {
  id: string;
  platformPostId: string;
  name: string;
  /** Empty means the automation triggers on any comment (Phase 16.2, requirement 12). */
  keywords: string[];
  matchMode: 'CONTAINS' | 'WORD' | 'EXACT';
  audience: 'ANY' | 'FOLLOWER' | 'NON_FOLLOWER';
  commentReply: string | null;
  commentReplyVariations: string[];
  buttons: { title: string; url: string }[];
  dmMessage: string;
  isActive: boolean;
}

export type PostDetailLoadResult =
  | { ok: true; post: InstagramPostDetail; automations: AutomationSummary[] }
  | { ok: false; error: unknown };

/** One post and its automation(s).
 *
 * Fired together, not one after the other: both depend only on ids already in hand. Awaiting them
 * in sequence used to cost a full round trip normally, and up to ~1.9s whenever the automations
 * lookup falls through to reconcileFromZernio (which itself makes two Zernio calls). allSettled
 * preserves the asymmetry - a failed post is reported to the view, a failed automations lookup
 * falls through as an empty list (worst case the create button shows when one already exists,
 * which the create endpoint then correctly rejects). */
export async function loadPostDetail(
  organizationId: string,
  accountId: string,
  postId: string,
): Promise<PostDetailLoadResult> {
  const basePath = `/api/organizations/${organizationId}/instagram/accounts/${accountId}/posts/${postId}`;
  const [postResult, automationsResult] = await Promise.allSettled([
    callApi<InstagramPostDetail>(basePath),
    callApi<AutomationSummary[]>(`${basePath}/automations`),
  ]);

  if (postResult.status === 'rejected') {
    return { ok: false, error: postResult.reason };
  }
  return {
    ok: true,
    post: postResult.value,
    automations: automationsResult.status === 'fulfilled' ? automationsResult.value : [],
  };
}

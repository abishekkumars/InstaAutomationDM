'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { callApi } from '@/lib/api';
import { automationTags } from '@/lib/cache-tags';

// Still a plain <form action={...}> + FormData, matching the style already used by
// app/instagram/actions.ts - this action itself stays a server action either way. The two
// client components feeding it (keywords-field.tsx, dm-message-field.tsx) exist because a
// chip input and a live character-limit counter both need client interactivity that a plain
// server action can't provide on its own; both still submit through this same FormData
// contract (keywords as one comma-joined hidden field; buttons as repeated
// buttonTitle/buttonUrl inputs, paired by position below) rather than needing any change to
// how this action reads its input.
export async function createAutomationAction(formData: FormData): Promise<void> {
  const organizationId = formData.get('organizationId');
  const accountId = formData.get('accountId');
  const postId = formData.get('postId');
  if (
    typeof organizationId !== 'string' ||
    typeof accountId !== 'string' ||
    typeof postId !== 'string'
  ) {
    redirect('/');
  }

  const keywordsRaw = formData.get('keywords');
  const keywords =
    typeof keywordsRaw === 'string'
      ? keywordsRaw
          .split(',')
          .map((keyword) => keyword.trim())
          .filter((keyword) => keyword.length > 0)
      : [];
  const commentReply = formData.get('commentReply');

  // Up to 5 alternates, one hidden field each (Phase 16.2, requirement 13). Same repeated-field
  // convention as the buttons below.
  const commentReplyVariations = formData
    .getAll('commentReplyVariation')
    .map((reply) => String(reply).trim())
    .filter((reply) => reply.length > 0);

  // DmMessageField renders each button as two same-named inputs (buttonTitle/buttonUrl),
  // one pair per row, in the same order - getAll() preserves DOM order, so pairing by index
  // reconstructs each row without needing indexed field names.
  const buttonTitles = formData.getAll('buttonTitle').map(String);
  const buttonUrls = formData.getAll('buttonUrl').map(String);
  const buttons = buttonTitles
    .map((title, i) => ({ title: title.trim(), url: (buttonUrls[i] ?? '').trim() }))
    .filter((button) => button.title.length > 0 && button.url.length > 0);

  try {
    await callApi(
      `/api/organizations/${organizationId}/instagram/accounts/${accountId}/posts/${postId}/automations`,
      {
        method: 'POST',
        body: JSON.stringify({
          name: formData.get('name'),
          // Sent even when empty - an empty array is the "Any comments" trigger (requirement
          // 12), not a missing value, so it must not be collapsed to undefined.
          keywords,
          matchMode: formData.get('matchMode'),
          audience: formData.get('audience') ?? 'any',
          commentReply:
            typeof commentReply === 'string' && commentReply.length > 0 ? commentReply : undefined,
          commentReplyVariations:
            commentReplyVariations.length > 0 ? commentReplyVariations : undefined,
          buttons: buttons.length > 0 ? buttons : undefined,
          dmMessage: formData.get('dmMessage'),
          // Absent means "use the default" (enabled) - only an explicit 'false' disables.
          isActive: formData.get('isActive') !== 'false',
        }),
      },
    );
  } catch (error) {
    // Same reasoning as app/instagram/actions.ts's connectInstagramAction - surface the real
    // cause server-side instead of leaving only a generic error banner to debug from.
    console.error('[automations] create failed:', error);
    redirect(`/instagram/posts/${postId}?accountId=${accountId}&automation=error`);
  }

  // Without this the dashboard would keep serving its cached automations list for up to the TTL,
  // so a just-created automation would be missing from the table the user lands back on.
  for (const tag of automationTags(organizationId)) {
    revalidateTag(tag, { expire: 0 });
  }
  revalidatePath('/');

  redirect(`/instagram/posts/${postId}?accountId=${accountId}&automation=created`);
}

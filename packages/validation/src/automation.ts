import { z } from 'zod';

// One inline DM button - title + link only (Zernio's own `type: url`). `type: postback`
// (needs a webhook handler this project doesn't have) and `type: phone` (Facebook-only,
// irrelevant to an Instagram-only tool) are real Zernio options but out of scope here - see
// docs/ZERNIO-INTEGRATION.md's "Comment-to-DM automation API" section.
export const automationButtonSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Button label is required.')
    .max(20, 'Button label must be 20 characters or fewer.'),
  url: z.string().trim().min(1, 'Button link is required.').url('Enter a valid URL.'),
});

export type AutomationButtonInput = z.infer<typeof automationButtonSchema>;

// Shape of the body apps/web posts when saving a comment automation on a post/reel's detail
// page (Phase 10). Mirrors Zernio's own POST /v1/comment-automations fields we actually use -
// see docs/ZERNIO-INTEGRATION.md's "Comment-to-DM automation API" section. `keywords` is
// deliberately an array, not a single string - Zernio's own API takes multiple keywords per
// automation, and this project's product model (docs/AUTOMATION-ENGINE.md) is "one keyword,
// or a short list of keywords," not exactly one.
export const createAutomationSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required.').max(200),
    keywords: z.array(z.string().trim().min(1)).min(1, 'At least one keyword is required.').max(50),
    matchMode: z.enum(['contains', 'word', 'exact']).default('contains'),
    commentReply: z.string().trim().min(1).optional(),
    // Up to 3, Zernio's own limit (Phase 10.1) - see docs/ZERNIO-INTEGRATION.md.
    buttons: z.array(automationButtonSchema).max(3, 'Up to 3 buttons are allowed.').optional(),
    // Zernio's own limit: max 1000 chars for a plain-text DM, but only 640 once buttons are
    // attached (enforced below, not here, since it depends on the sibling `buttons` field) -
    // see docs/ZERNIO-INTEGRATION.md.
    dmMessage: z.string().trim().min(1, 'A DM message is required.').max(1000),
  })
  .refine((value) => !value.buttons?.length || value.dmMessage.length <= 640, {
    message: 'DM message must be 640 characters or fewer when buttons are added.',
    path: ['dmMessage'],
  });

export type CreateAutomationInput = z.infer<typeof createAutomationSchema>;

import { z } from 'zod';

// Shape of the body apps/web posts when saving a comment automation on a post/reel's detail
// page (Phase 10). Mirrors Zernio's own POST /v1/comment-automations fields we actually use -
// see docs/ZERNIO-INTEGRATION.md's "Comment-to-DM automation API" section. `keywords` is
// deliberately an array, not a single string - Zernio's own API takes multiple keywords per
// automation, and this project's product model (docs/AUTOMATION-ENGINE.md) is "one keyword,
// or a short list of keywords," not exactly one.
export const createAutomationSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(200),
  keywords: z.array(z.string().trim().min(1)).min(1, 'At least one keyword is required.').max(50),
  matchMode: z.enum(['contains', 'word', 'exact']).default('contains'),
  commentReply: z.string().trim().min(1).optional(),
  // Zernio's own limit: max 1000 chars for a plain-text DM (this project never sends DM
  // buttons, which would lower that to 640) - see docs/ZERNIO-INTEGRATION.md.
  dmMessage: z.string().trim().min(1, 'A DM message is required.').max(1000),
});

export type CreateAutomationInput = z.infer<typeof createAutomationSchema>;

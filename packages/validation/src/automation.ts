import { z } from 'zod';

// Single source of truth for every length/count limit on an automation, exported so apps/web
// can enforce the same numbers in the UI (maxLength attributes, live counters, disabled submit
// buttons) instead of hardcoding its own copies. Duplicated literals are how a form ends up
// letting a user type 250 characters and only learning at the API that the cap is 200.
export const AUTOMATION_LIMITS = {
  /** Zernio's own automation label limit. */
  nameMax: 200,
  keywordsMax: 50,
  buttonsMax: 3,
  buttonTitleMax: 20,
  /** Plain-text DM. Drops to dmMessageWithButtonsMax once any button is attached. */
  dmMessageMax: 1000,
  dmMessageWithButtonsMax: 640,
  commentReplyMax: 1000,
  /** Alternate public replies, on top of the primary `commentReply`. Zernio's own
   * `commentReplyVariations` has `maxItems: 5` (verified against the live OpenAPI spec,
   * Phase 16.2). */
  commentReplyVariationsMax: 5,
} as const;

/** Which commenters an automation may answer (Phase 16.2, requirement 11). Mirrors Zernio's
 * `audience.followerStatus`. */
export const AUTOMATION_AUDIENCES = ['any', 'follower', 'non_follower'] as const;

// One inline DM button - title + link only (Zernio's own `type: url`). `type: postback`
// (needs a webhook handler this project doesn't have) and `type: phone` (Facebook-only,
// irrelevant to an Instagram-only tool) are real Zernio options but out of scope here - see
// docs/ZERNIO-INTEGRATION.md's "Comment-to-DM automation API" section.
export const automationButtonSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Button label is required.')
    .max(
      AUTOMATION_LIMITS.buttonTitleMax,
      `Button label must be ${AUTOMATION_LIMITS.buttonTitleMax} characters or fewer.`,
    ),
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
    name: z
      .string()
      .trim()
      .min(1, 'Name is required.')
      .max(
        AUTOMATION_LIMITS.nameMax,
        `Name must be ${AUTOMATION_LIMITS.nameMax} characters or fewer.`,
      ),
    // No `.min(1)` as of Phase 16.2 (requirement 12): an EMPTY array is now a valid, meaningful
    // configuration - it is how the wizard's "Any comments" tab says "trigger on every comment",
    // which is Zernio's own documented behaviour for an empty keyword list. The previous
    // "At least one keyword is required." rule was correct only while specific-keyword was the
    // sole trigger type.
    keywords: z.array(z.string().trim().min(1)).max(AUTOMATION_LIMITS.keywordsMax),
    matchMode: z.enum(['contains', 'word', 'exact']).default('contains'),
    audience: z.enum(AUTOMATION_AUDIENCES).default('any'),
    commentReply: z.string().trim().min(1).max(AUTOMATION_LIMITS.commentReplyMax).optional(),
    // Up to 5 alternates, on top of `commentReply`. Zernio rotates between them at random - it
    // does not post all of them on one comment.
    commentReplyVariations: z
      .array(z.string().trim().min(1).max(AUTOMATION_LIMITS.commentReplyMax))
      .max(
        AUTOMATION_LIMITS.commentReplyVariationsMax,
        `Up to ${AUTOMATION_LIMITS.commentReplyVariationsMax} extra replies are allowed.`,
      )
      .optional(),
    // Up to 3, Zernio's own limit (Phase 10.1) - see docs/ZERNIO-INTEGRATION.md.
    buttons: z
      .array(automationButtonSchema)
      .max(
        AUTOMATION_LIMITS.buttonsMax,
        `Up to ${AUTOMATION_LIMITS.buttonsMax} buttons are allowed.`,
      )
      .optional(),
    // Zernio's own limit: max 1000 chars for a plain-text DM, but only 640 once buttons are
    // attached (enforced below, not here, since it depends on the sibling `buttons` field) -
    // see docs/ZERNIO-INTEGRATION.md.
    dmMessage: z
      .string()
      .trim()
      .min(1, 'A DM message is required.')
      .max(AUTOMATION_LIMITS.dmMessageMax),
    // Defaults to enabled, matching Zernio's own behaviour for a newly created automation.
    // Creating one paused is a real use case: set it up now, switch it on when the post goes
    // live.
    isActive: z.boolean().default(true),
  })
  .refine(
    (value) =>
      !value.buttons?.length || value.dmMessage.length <= AUTOMATION_LIMITS.dmMessageWithButtonsMax,
    {
      message: `DM message must be ${AUTOMATION_LIMITS.dmMessageWithButtonsMax} characters or fewer when buttons are added.`,
      path: ['dmMessage'],
    },
  )
  .refine((value) => !value.commentReplyVariations?.length || Boolean(value.commentReply), {
    // Zernio rotates over `[commentReply, ...commentReplyVariations]`. With no primary reply
    // there is nothing to rotate *with*, and the variations would either be silently ignored or
    // silently promoted - neither of which is what the user configured.
    message: 'Add a public reply before adding alternates.',
    path: ['commentReplyVariations'],
  });

export type CreateAutomationInput = z.infer<typeof createAutomationSchema>;

// Shape of the body apps/web sends when editing an existing automation (PATCH). Every field
// is optional - Zernio's own PATCH is a partial update that leaves unsent fields untouched -
// but at least one must be present, so an empty body is rejected rather than silently
// producing a no-op round trip to Zernio.
//
// Two deliberate differences from createAutomationSchema:
//  - `commentReply` accepts '' (not min(1)): that is how the public reply gets cleared. On
//    create there is nothing to clear, so an empty string is meaningless there.
//  - `buttons` accepts [] for the same reason - Zernio's documented way to remove every
//    button, as distinct from omitting the key, which keeps the stored ones.
//
// The conditional 640-char rule cannot be fully enforced here: with a partial update the
// message and the buttons may not both be present in the same request (e.g. changing only
// dmMessage on an automation that already has buttons stored). This schema checks it when
// both arrive together; AutomationsService re-checks against the stored row, which is the
// only place the full picture exists.
export const updateAutomationSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Name is required.')
      .max(
        AUTOMATION_LIMITS.nameMax,
        `Name must be ${AUTOMATION_LIMITS.nameMax} characters or fewer.`,
      )
      .optional(),
    // As on create, `[]` is meaningful rather than invalid - it switches an existing automation
    // over to triggering on any comment.
    keywords: z.array(z.string().trim().min(1)).max(AUTOMATION_LIMITS.keywordsMax).optional(),
    matchMode: z.enum(['contains', 'word', 'exact']).optional(),
    audience: z.enum(AUTOMATION_AUDIENCES).optional(),
    commentReply: z.string().trim().max(AUTOMATION_LIMITS.commentReplyMax).optional(),
    // `[]` clears every alternate, same convention as `buttons`.
    commentReplyVariations: z
      .array(z.string().trim().min(1).max(AUTOMATION_LIMITS.commentReplyMax))
      .max(
        AUTOMATION_LIMITS.commentReplyVariationsMax,
        `Up to ${AUTOMATION_LIMITS.commentReplyVariationsMax} extra replies are allowed.`,
      )
      .optional(),
    buttons: z
      .array(automationButtonSchema)
      .max(
        AUTOMATION_LIMITS.buttonsMax,
        `Up to ${AUTOMATION_LIMITS.buttonsMax} buttons are allowed.`,
      )
      .optional(),
    dmMessage: z
      .string()
      .trim()
      .min(1, 'A DM message is required.')
      .max(AUTOMATION_LIMITS.dmMessageMax)
      .optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Nothing to update.',
  })
  .refine(
    (value) =>
      value.buttons === undefined ||
      value.dmMessage === undefined ||
      value.buttons.length === 0 ||
      value.dmMessage.length <= AUTOMATION_LIMITS.dmMessageWithButtonsMax,
    {
      message: `DM message must be ${AUTOMATION_LIMITS.dmMessageWithButtonsMax} characters or fewer when buttons are added.`,
      path: ['dmMessage'],
    },
  );

export type UpdateAutomationInput = z.infer<typeof updateAutomationSchema>;

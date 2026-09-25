import { z } from 'zod';
import { AUTOMATION_AUDIENCES, AUTOMATION_LIMITS, automationButtonSchema } from './automation';

/** Limits specific to templates (Phase 19). Every field a template shares with an automation
 * uses AUTOMATION_LIMITS, so a template can never hold a value the create popup would then
 * reject. */
export const TEMPLATE_LIMITS = {
  /** The template's own label on the Templates page. Shorter than an automation name because it
   * is typed by hand, not derived from a caption. */
  nameMax: 80,
  /** Per organization. Keeps the create popup's dropdown usable and every list query bounded. */
  perOrganizationMax: 50,
} as const;

export const TEMPLATE_TRIGGER_TYPES = ['keywords', 'any'] as const;
export type TemplateTriggerType = (typeof TEMPLATE_TRIGGER_TYPES)[number];

/** Body for creating or replacing a template. PUT sends the whole template, not a patch: the
 * editor always holds every field, so a full replace is simpler and cannot half-apply.
 *
 * Only `name` is required (Phase 19). Everything else may be left for the create popup to
 * fill. The shared rules still apply, because the popup would reject a pre-filled value that
 * breaks them:
 *  - at most 640 characters of DM once a button is attached;
 *  - no alternate replies without a primary reply.
 *
 * Blank optional text (`''`) is normalised to `undefined`, so the editor can send every field
 * on every save without an empty string becoming a stored value. */
export const automationTemplateSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Template name is required.')
      .max(
        TEMPLATE_LIMITS.nameMax,
        `Template name must be ${TEMPLATE_LIMITS.nameMax} characters or fewer.`,
      ),
    triggerType: z.enum(TEMPLATE_TRIGGER_TYPES).default('keywords'),
    keywords: z.array(z.string().trim().min(1)).max(AUTOMATION_LIMITS.keywordsMax).default([]),
    matchMode: z.enum(['contains', 'word', 'exact']).default('contains'),
    audience: z.enum(AUTOMATION_AUDIENCES).default('any'),
    commentReply: blankToUndefined(z.string().trim().max(AUTOMATION_LIMITS.commentReplyMax)),
    commentReplyVariations: z
      .array(z.string().trim().min(1).max(AUTOMATION_LIMITS.commentReplyMax))
      .max(
        AUTOMATION_LIMITS.commentReplyVariationsMax,
        `Up to ${AUTOMATION_LIMITS.commentReplyVariationsMax} extra replies are allowed.`,
      )
      .default([]),
    dmMessage: blankToUndefined(z.string().trim().max(AUTOMATION_LIMITS.dmMessageMax)),
    buttons: z
      .array(automationButtonSchema)
      .max(
        AUTOMATION_LIMITS.buttonsMax,
        `Up to ${AUTOMATION_LIMITS.buttonsMax} buttons are allowed.`,
      )
      .default([]),
    isActive: z.boolean().default(true),
  })
  .refine(
    (value) =>
      value.buttons.length === 0 ||
      (value.dmMessage?.length ?? 0) <= AUTOMATION_LIMITS.dmMessageWithButtonsMax,
    {
      message: `DM message must be ${AUTOMATION_LIMITS.dmMessageWithButtonsMax} characters or fewer when buttons are added.`,
      path: ['dmMessage'],
    },
  )
  .refine((value) => value.commentReplyVariations.length === 0 || Boolean(value.commentReply), {
    message: 'Add a public reply before adding alternates.',
    path: ['commentReplyVariations'],
  })
  // "Any comments" means no keywords, as it does for an automation. Stored keywords would be
  // invisible in the popup yet come back if someone switched the tab, which is confusing, so
  // they are dropped here rather than rejected.
  .transform((value) =>
    value.triggerType === 'any' ? { ...value, keywords: [] as string[] } : value,
  );

export type AutomationTemplateInput = z.infer<typeof automationTemplateSchema>;

function blankToUndefined<T extends z.ZodType<string>>(schema: T) {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim().length === 0 ? undefined : value),
    schema.optional(),
  );
}

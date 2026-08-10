import { z } from 'zod';

// Format rules for docs/DATABASE.md's Organization.slug ("format validation ... is an
// application-layer concern for whichever phase builds org creation") - Phase 6, here.
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const createOrganizationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Organization name is required.')
    .max(100, 'Organization name must be at most 100 characters.'),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'Slug is required.')
    .max(50, 'Slug must be at most 50 characters.')
    .regex(
      SLUG_PATTERN,
      'Slug must be lowercase letters, numbers, and hyphens only (no leading/trailing/double hyphens).',
    ),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

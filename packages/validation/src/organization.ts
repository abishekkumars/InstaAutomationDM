import { z } from 'zod';

// Format rules for docs/DATABASE.md's Organization.slug ("format validation ... is an
// application-layer concern for whichever phase builds org creation") - Phase 6, here.
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Longest slug `createOrganizationSchema` will accept. Exported so `slugFromEmail` truncates
 * to the same number rather than hardcoding a second copy of it. */
export const SLUG_MAX_LENGTH = 50;

/** What `slugFromEmail` returns when an address has no usable characters before the `@`
 * (e.g. `"..."@example.com`, which is a syntactically legal address). An empty string would
 * fail SLUG_PATTERN, so there has to be *some* fallback; the caller's collision loop turns a
 * second one into `user-2`. */
const SLUG_FALLBACK = 'user';

/** Derives a candidate organization slug from a user's email address (Phase 15.2,
 * requirement 5): the local part, reduced to what SLUG_PATTERN allows.
 *
 * `john@example.com` -> `john`, `john.doe@example.com` -> `john-doe`,
 * `John+news@example.com` -> `john-news`.
 *
 * **This is a candidate, not a final answer.** Email local parts are not unique across
 * domains - `john@gmail.com` and `john@company.com` both reduce to `john` - so the caller
 * must resolve collisions against the `organizations.slug` unique constraint before
 * inserting (`AdminService.listUsers` suggests the next free variant; the constraint itself
 * is what finally enforces it). Getting that wrong is not a cosmetic bug: the
 * Zernio profile name derives from the slug, and `ensureProfile` reuses a profile it finds by
 * name, so two organizations sharing a slug would share one Zernio profile and the second
 * would adopt the first's connected Instagram account. See
 * `docs/ADR/0007-global-user-roles-and-administration.md`.
 *
 * The result is guaranteed to satisfy SLUG_PATTERN and SLUG_MAX_LENGTH, so it can be fed
 * straight into `createOrganizationSchema`. */
export function slugFromEmail(email: string): string {
  const localPart = email.split('@')[0] ?? '';

  const slug = localPart
    .toLowerCase()
    // Anything SLUG_PATTERN disallows becomes a separator rather than being dropped, so
    // `john.doe` reads as `john-doe` instead of collapsing to the misleading `johndoe`.
    .replace(/[^a-z0-9]+/g, '-')
    // Collapse runs and trim the ends, which SLUG_PATTERN forbids.
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    // Re-trim AFTER truncating: slicing can land exactly on a hyphen and reintroduce the
    // trailing-hyphen the previous step just removed.
    .replace(/-$/, '');

  return slug.length > 0 ? slug : SLUG_FALLBACK;
}

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
    .max(SLUG_MAX_LENGTH, `Slug must be at most ${SLUG_MAX_LENGTH} characters.`)
    .regex(
      SLUG_PATTERN,
      'Slug must be lowercase letters, numbers, and hyphens only (no leading/trailing/double hyphens).',
    ),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

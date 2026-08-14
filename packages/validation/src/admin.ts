import { z } from 'zod';
import { createOrganizationSchema } from './organization';

// Request shapes for the Administration endpoints (Phase 15.2, requirements 16 + the
// administrator half of 4). See docs/API-SPEC.md's `/api/admin/*` section.

/** Grant or revoke the global ADMIN role.
 *
 * Note what is NOT here: there is no schema anywhere that accepts a role on *user creation*.
 * That is requirement 20 - a new account's role is always derived server-side - and the
 * absence is deliberate, not an oversight. Changing a role is an explicit administrator
 * action against an existing user, which is what this schema is for. */
export const updateUserRoleSchema = z.object({
  role: z.enum(['ADMIN', 'NORMAL_USER'], {
    message: 'Role must be either ADMIN or NORMAL_USER.',
  }),
});

/** Add a user to an organization. The organization role defaults to OWNER because the common
 * case by far is an administrator setting up a brand-new user with their own organization;
 * an admin adding a second person to an existing org passes MEMBER explicitly. */
export const addMembershipSchema = z.object({
  organizationId: z.string().trim().min(1, 'An organization is required.'),
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER']).default('OWNER'),
});

/** Create an organization from the Administration surface. Extends the Phase 6 schema (same
 * name/slug rules - the slug still has to satisfy SLUG_PATTERN however it was arrived at)
 * with an optional owner, so "create this org and put this user in it" is one request rather
 * than two that can half-fail. */
export const adminCreateOrganizationSchema = createOrganizationSchema.extend({
  ownerUserId: z.string().trim().min(1).optional(),
});

export type UpdateUserRoleInput = z.infer<typeof updateUserRoleSchema>;
export type AddMembershipInput = z.infer<typeof addMembershipSchema>;
export type AdminCreateOrganizationInput = z.infer<typeof adminCreateOrganizationSchema>;

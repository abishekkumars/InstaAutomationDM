import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { Prisma, type OrganizationRole, type UserRole } from '@automationdm/database';
import {
  addMembershipSchema,
  adminCreateOrganizationSchema,
  slugFromEmail,
  updateUserRoleSchema,
} from '@automationdm/validation';
import { ZernioApiError, type InstagramProvider } from '@automationdm/zernio';
import { PrismaService } from '../database/prisma.service';
import { INSTAGRAM_PROVIDER } from '../instagram/instagram-provider.token';

export interface AdminOrganizationSummary {
  id: string;
  name: string;
  slug: string;
  memberCount: number;
}

export interface AdminUserMembership {
  organizationId: string;
  name: string;
  slug: string;
  role: OrganizationRole;
}

export interface AdminUserSummary {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  createdAt: Date;
  organizations: AdminUserMembership[];
  /** A slug the Administration UI can prefill when creating this user's organization, derived
   * from their email and already checked for collisions (requirement 5). Computed here rather
   * than in the browser because the collision check needs the database, and because
   * requirement 19 puts this kind of derivation server-side on principle. */
  suggestedSlug: string;
}

/** Everything behind `/api/admin/*` (Phase 15.2). Authorization is the AdminGuard's job, not
 * this service's - every method here assumes the caller is already known to be an ADMIN.
 *
 * Note what these methods deliberately do NOT do: they never read an organization's automations
 * or Instagram accounts. Being an administrator grants no tenant data access
 * (docs/ADR/0007-global-user-roles-and-administration.md) - it only grants the ability to manage
 * who belongs where. An admin who needs to see an org's data takes a membership in it, through
 * the same table as everyone else, and is then subject to the same isolation rules. */
@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(INSTAGRAM_PROVIDER) private readonly provider: InstagramProvider,
  ) {}

  async listUsers(): Promise<AdminUserSummary[]> {
    const users = await this.prisma.client.user.findMany({
      // Never select passwordHash - see docs/DATABASE.md's `User` notes.
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        memberships: {
          select: { role: true, organization: { select: { id: true, name: true, slug: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      // Newest first: the Administration screen exists mainly to admit people who just signed
      // up, and they are the ones that should be at the top of it.
      orderBy: { createdAt: 'desc' },
    });

    return users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
      organizations: user.memberships.map((membership) => ({
        organizationId: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
        role: membership.role,
      })),
      // The raw slug derived from the email, with NO uniqueness suffix appended.
      //
      // It used to be run through a `base`, `base-2`, `base-3` sequence so the prefilled value
      // was always free. That was removed deliberately: an administrator typing a name saw the
      // field silently mutate into something they had not chosen, which is confusing precisely
      // when it matters (the slug is permanent and the Zernio profile name derives from it).
      // A collision is now surfaced honestly as a 409 from `createOrganization` instead of being
      // quietly worked around - `organizations.slug`'s unique constraint was always the real
      // authority, and this only ever produced a suggestion.
      suggestedSlug: slugFromEmail(user.email),
    }));
  }

  async listOrganizations(): Promise<AdminOrganizationSummary[]> {
    const organizations = await this.prisma.client.organization.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        _count: { select: { memberships: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return organizations.map((organization) => ({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      memberCount: organization._count.memberships,
    }));
  }

  async createOrganization(input: unknown): Promise<AdminOrganizationSummary> {
    const { name, slug, ownerUserId } = parse(adminCreateOrganizationSchema, input);

    if (ownerUserId) {
      await this.requireUser(ownerUserId);
    }

    try {
      const organization = await this.prisma.client.organization.create({
        data: {
          name,
          slug,
          memberships: ownerUserId ? { create: { userId: ownerUserId, role: 'OWNER' } } : undefined,
        },
        select: { id: true, name: true, slug: true, _count: { select: { memberships: true } } },
      });
      return {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        memberCount: organization._count.memberships,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // The slug the UI prefilled can go stale between rendering the form and submitting it,
        // so this is a normal outcome to report, not an unexpected one.
        throw new ConflictException('An organization with that slug already exists.');
      }
      throw error;
    }
  }

  async addMembership(userId: string, input: unknown): Promise<AdminUserMembership> {
    const { organizationId, role } = parse(addMembershipSchema, input);

    await this.requireUser(userId);
    const organization = await this.prisma.client.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, slug: true },
    });
    if (!organization) {
      throw new NotFoundException('Organization not found.');
    }

    try {
      const membership = await this.prisma.client.organizationMember.create({
        data: { userId, organizationId, role },
      });
      return {
        organizationId: organization.id,
        name: organization.name,
        slug: organization.slug,
        role: membership.role,
      };
    } catch (error) {
      // The @@unique([organizationId, userId]) constraint. Two admins acting at once, or a
      // double-submit, both land here.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('That user is already a member of this organization.');
      }
      throw error;
    }
  }

  async removeMembership(userId: string, organizationId: string): Promise<void> {
    const membership = await this.prisma.client.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    if (!membership) {
      throw new NotFoundException('That user is not a member of this organization.');
    }

    await this.prisma.client.organizationMember.delete({ where: { id: membership.id } });
  }

  /** Permanently deletes an organization that has no members left, along with its Zernio
   * profile.
   *
   * **Members must be zero.** That is the whole safety model here: an organization someone still
   * belongs to is somebody's live workspace, and the administrator screen has no view of what is
   * inside it (ADR 0007 - being an admin grants no tenant data access). Requiring the memberships
   * to be removed first makes the deletion a deliberate two-step act rather than one button that
   * can vaporise an active tenant.
   *
   * The order below is dictated by Zernio's API, not chosen: its own description of
   * `DELETE /v1/profiles/{profileId}` says *"Active connected accounts block deletion (returns
   * 400) - disconnect them first"*. So every connected account is disconnected, then the profile
   * goes, then the local row - whose cascades take the Instagram accounts, automations and Meta
   * connections with it.
   *
   * Remote failures are **not** swallowed. Deleting our row while Zernio still holds a live
   * profile and connected accounts would leave automations running that nothing in this app can
   * see or stop - the precise failure mode Phase 10.2b existed to fix. A 404 is the exception:
   * it means the remote object is already gone, which is the state we were trying to reach. */
  async deleteOrganization(organizationId: string): Promise<void> {
    const organization = await this.prisma.client.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        slug: true,
        zernioProfileId: true,
        _count: { select: { memberships: true } },
        instagramAccounts: { select: { id: true, zernioAccountId: true } },
      },
    });
    if (!organization) {
      throw new NotFoundException('Organization not found.');
    }
    if (organization._count.memberships > 0) {
      throw new BadRequestException(
        `"${organization.slug}" still has ${organization._count.memberships} member(s). ` +
          'Remove them before deleting the organization.',
      );
    }

    for (const account of organization.instagramAccounts) {
      await this.disconnectRemoteAccount(account.zernioAccountId);
    }

    if (organization.zernioProfileId) {
      try {
        await this.provider.deleteProfile({ zernioProfileId: organization.zernioProfileId });
      } catch (error) {
        if (error instanceof ZernioApiError && error.status === 404) {
          this.logger.warn(
            `Zernio profile ${organization.zernioProfileId} was already gone; continuing.`,
          );
        } else {
          throw error;
        }
      }
    }

    // Cascades handle instagram_accounts, automations, meta_connections and memberships - see
    // their onDelete: Cascade relations in docs/DATABASE.md.
    await this.prisma.client.organization.delete({ where: { id: organization.id } });
  }

  private async disconnectRemoteAccount(zernioAccountId: string): Promise<void> {
    try {
      await this.provider.disconnectAccount({ zernioAccountId });
    } catch (error) {
      if (error instanceof ZernioApiError && error.status === 404) {
        // Already disconnected on Zernio's side. Nothing to undo, and the profile delete that
        // follows will no longer be blocked by it.
        this.logger.warn(`Zernio account ${zernioAccountId} was already disconnected; continuing.`);
        return;
      }
      throw error;
    }
  }

  /** Grants or revokes the global ADMIN role.
   *
   * `callerId` is used only for the last-admin check's error message - an admin IS allowed to
   * demote themselves, as long as they are not the last one. Blocking self-demotion outright
   * would be the wrong rule: with two admins, either should be able to step down. */
  async updateUserRole(
    callerId: string,
    userId: string,
    input: unknown,
  ): Promise<AdminUserSummary> {
    const { role } = parse(updateUserRoleSchema, input);

    const target = await this.requireUser(userId);

    if (target.role === 'ADMIN' && role === 'NORMAL_USER') {
      // Lockout guard. Without it the last administrator can revoke themselves and leave the
      // Administration surface permanently unreachable - nobody left who can grant it back.
      // ADMIN_EMAIL would still recover it on next sign-in, but only if it happens to be set
      // and to point at a real account, which is too thin a thread to hang this on.
      const adminCount = await this.prisma.client.user.count({ where: { role: 'ADMIN' } });
      if (adminCount <= 1) {
        throw new ConflictException(
          userId === callerId
            ? 'You are the only administrator. Grant the role to someone else before revoking your own.'
            : 'That is the only administrator. Grant the role to someone else first.',
        );
      }
    }

    await this.prisma.client.user.update({ where: { id: userId }, data: { role } });

    // Re-read through listUsers' own shape so the caller gets exactly what the list returns,
    // rather than a second, subtly different user representation to keep in sync.
    const updated = (await this.listUsers()).find((user) => user.id === userId);
    if (!updated) {
      // Deleted between the update and the re-read. Vanishingly unlikely; still not an
      // assertion worth faking a response over.
      throw new NotFoundException('User not found.');
    }
    return updated;
  }

  private async requireUser(userId: string) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true },
    });
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    return user;
  }
}

/** Shared Zod-to-BadRequest translation, matching the pattern in organizations.service.ts and
 * instagram.service.ts. */
function parse<T>(schema: { parse: (input: unknown) => T }, input: unknown): T {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new BadRequestException(error.issues[0]?.message ?? 'Invalid input.');
    }
    throw error;
  }
}

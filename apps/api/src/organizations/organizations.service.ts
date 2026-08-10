import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { Prisma, type OrganizationRole } from '@automationdm/database';
import { createOrganizationSchema } from '@automationdm/validation';
import { PrismaService } from '../database/prisma.service';

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  role: OrganizationRole;
}

export interface OrganizationMemberSummary {
  id: string;
  role: OrganizationRole;
  user: { id: string; email: string; name: string | null };
}

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, input: unknown): Promise<OrganizationSummary> {
    let name: string;
    let slug: string;
    try {
      ({ name, slug } = createOrganizationSchema.parse(input));
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException(error.issues[0]?.message ?? 'Invalid input.');
      }
      throw error;
    }

    try {
      const organization = await this.prisma.client.organization.create({
        data: {
          name,
          slug,
          memberships: { create: { userId, role: 'OWNER' } },
        },
      });
      return {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        role: 'OWNER',
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('An organization with that slug already exists.');
      }
      throw error;
    }
  }

  async listForUser(userId: string): Promise<OrganizationSummary[]> {
    const memberships = await this.prisma.client.organizationMember.findMany({
      where: { userId },
      include: { organization: true },
      orderBy: { createdAt: 'asc' },
    });

    return memberships.map((membership) => ({
      id: membership.organization.id,
      name: membership.organization.name,
      slug: membership.organization.slug,
      role: membership.role,
    }));
  }

  async listMembers(userId: string, organizationId: string): Promise<OrganizationMemberSummary[]> {
    // Tenant isolation: confirm the caller is a member of this org BEFORE returning
    // anything about it - never trust the :id path param alone. Not-found (not forbidden)
    // so a non-member can't distinguish "doesn't exist" from "exists but you're not in it".
    const callerMembership = await this.prisma.client.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    if (!callerMembership) {
      throw new NotFoundException('Organization not found.');
    }

    const members = await this.prisma.client.organizationMember.findMany({
      where: { organizationId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });

    return members.map((member) => ({
      id: member.id,
      role: member.role,
      user: { id: member.user.id, email: member.user.email, name: member.user.name },
    }));
  }
}

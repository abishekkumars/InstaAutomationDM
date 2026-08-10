import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { Prisma, type InstagramAccountStatus } from '@automationdm/database';
import { instagramCallbackSchema } from '@automationdm/validation';
import type { InstagramProvider } from '@automationdm/zernio';
import { PrismaService } from '../database/prisma.service';
import { getAppUrl } from '../config/app-url';
import { INSTAGRAM_PROVIDER } from './instagram-provider.token';

export interface InstagramAccountSummary {
  id: string;
  zernioAccountId: string;
  username: string | null;
  status: InstagramAccountStatus;
}

@Injectable()
export class InstagramService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(INSTAGRAM_PROVIDER) private readonly provider: InstagramProvider,
  ) {}

  private async requireMembership(userId: string, organizationId: string): Promise<void> {
    // Same tenant-isolation pattern as organizations.service.ts's listMembers: 404 (not 403)
    // for an org the caller isn't a member of, so a non-member can't distinguish "doesn't
    // exist" from "exists but you're not in it".
    const membership = await this.prisma.client.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    if (!membership) {
      throw new NotFoundException('Organization not found.');
    }
  }

  async listAccounts(userId: string, organizationId: string): Promise<InstagramAccountSummary[]> {
    await this.requireMembership(userId, organizationId);

    const accounts = await this.prisma.client.instagramAccount.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
    });
    return accounts.map(toSummary);
  }

  async createConnectUrl(userId: string, organizationId: string): Promise<{ authUrl: string }> {
    await this.requireMembership(userId, organizationId);

    const organization = await this.prisma.client.organization.findUniqueOrThrow({
      where: { id: organizationId },
    });

    let zernioProfileId = organization.zernioProfileId;
    if (!zernioProfileId) {
      const profile = await this.provider.ensureProfile({ name: organization.slug });
      zernioProfileId = profile.zernioProfileId;
      await this.prisma.client.organization.update({
        where: { id: organizationId },
        data: { zernioProfileId },
      });
    }

    const redirectUrl = `${getAppUrl()}/instagram/callback?organizationId=${organizationId}`;
    const { authUrl } = await this.provider.getConnectUrl({ zernioProfileId, redirectUrl });
    return { authUrl };
  }

  async handleCallback(
    userId: string,
    organizationId: string,
    input: unknown,
  ): Promise<InstagramAccountSummary> {
    await this.requireMembership(userId, organizationId);

    let profileId: string;
    let accountId: string;
    try {
      ({ profileId, accountId } = instagramCallbackSchema.parse(input));
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException(error.issues[0]?.message ?? 'Invalid input.');
      }
      throw error;
    }

    const organization = await this.prisma.client.organization.findUniqueOrThrow({
      where: { id: organizationId },
    });
    if (organization.zernioProfileId !== profileId) {
      throw new BadRequestException('This connection does not belong to this organization.');
    }

    // Never trust the redirect query params alone (they arrived via the user's own browser) -
    // independently confirm the connection with a live Zernio call before writing anything.
    const confirmed = await this.provider.findConnectedAccount({ zernioProfileId: profileId });
    if (!confirmed || confirmed.zernioAccountId !== accountId) {
      throw new BadRequestException('Could not confirm this Instagram connection with Zernio.');
    }

    const existing = await this.prisma.client.instagramAccount.findUnique({
      where: { zernioAccountId: accountId },
    });
    if (existing && existing.organizationId !== organizationId) {
      throw new ConflictException(
        'This Instagram account is already connected to a different organization.',
      );
    }

    try {
      const account = await this.prisma.client.instagramAccount.upsert({
        where: { zernioAccountId: accountId },
        create: {
          organizationId,
          zernioAccountId: accountId,
          username: confirmed.username,
          status: 'CONNECTED',
        },
        update: { username: confirmed.username, status: 'CONNECTED' },
      });
      return toSummary(account);
    } catch (error) {
      // Covers the race between the findUnique check above and this upsert - two concurrent
      // callbacks for the same zernioAccountId can both pass the check but only one create
      // wins; the loser hits this unique-constraint violation instead of silently
      // overwriting the winner's organizationId.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(
          'This Instagram account is already connected to a different organization.',
        );
      }
      throw error;
    }
  }
}

function toSummary(account: {
  id: string;
  zernioAccountId: string;
  username: string | null;
  status: InstagramAccountStatus;
}): InstagramAccountSummary {
  return {
    id: account.id,
    zernioAccountId: account.zernioAccountId,
    username: account.username,
    status: account.status,
  };
}

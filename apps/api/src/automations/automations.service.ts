import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { AutomationMatchMode, Prisma } from '@automationdm/database';
import { createAutomationSchema } from '@automationdm/validation';
import { type InstagramProvider, ZernioApiError } from '@automationdm/zernio';
import { PrismaService } from '../database/prisma.service';
import { INSTAGRAM_PROVIDER } from '../instagram/instagram-provider.token';

export interface AutomationButton {
  title: string;
  url: string;
}

export interface AutomationSummary {
  id: string;
  zernioPostId: string;
  name: string;
  keywords: string[];
  matchMode: AutomationMatchMode;
  commentReply: string | null;
  buttons: AutomationButton[];
  dmMessage: string;
  isActive: boolean;
}

// listForOrganization's shape (dashboard table) - same fields as AutomationSummary plus
// which account it belongs to, since that list spans every connected account in the org
// (listForPost never needs this - the caller already knows the one account it asked about).
export interface AutomationListItem extends AutomationSummary {
  instagramAccountId: string;
  accountUsername: string | null;
}

function toMatchMode(matchMode: 'contains' | 'word' | 'exact'): AutomationMatchMode {
  return matchMode.toUpperCase() as AutomationMatchMode;
}

@Injectable()
export class AutomationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(INSTAGRAM_PROVIDER) private readonly provider: InstagramProvider,
  ) {}

  // Same tenant-isolation pattern as instagram.service.ts's requireMembership/
  // requireOwnAccount - 404 (not 403) for anything the caller can't prove they own, so a
  // non-member/non-owner can't distinguish "doesn't exist" from "exists but isn't yours".
  private async requireMembership(userId: string, organizationId: string): Promise<void> {
    const membership = await this.prisma.client.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    if (!membership) {
      throw new NotFoundException('Organization not found.');
    }
  }

  private async requireOwnAccount(organizationId: string, accountId: string) {
    const account = await this.prisma.client.instagramAccount.findUnique({
      where: { id: accountId },
    });
    if (!account || account.organizationId !== organizationId) {
      throw new NotFoundException('Instagram account not found.');
    }
    return account;
  }

  async listForPost(
    userId: string,
    organizationId: string,
    accountId: string,
    zernioPostId: string,
  ): Promise<AutomationSummary[]> {
    await this.requireMembership(userId, organizationId);
    await this.requireOwnAccount(organizationId, accountId);

    const automations = await this.prisma.client.automation.findMany({
      where: { instagramAccountId: accountId, zernioPostId },
    });
    return automations.map(toSummary);
  }

  // Org-wide, across every connected account - the dashboard table's data source. Uses the
  // same organizationId index the schema already carries for exactly this ("a future
  // dashboard/history view" - docs/DATABASE.md's Automation model), pulled forward from
  // Phase 12 because the redesigned dashboard needs it now, not a local matching/filtering
  // step - see docs/IMPLEMENTATION-ROADMAP.md's report for this phase.
  async listForOrganization(userId: string, organizationId: string): Promise<AutomationListItem[]> {
    await this.requireMembership(userId, organizationId);

    const automations = await this.prisma.client.automation.findMany({
      where: { organizationId },
      include: { instagramAccount: { select: { username: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return automations.map((automation) => ({
      ...toSummary(automation),
      instagramAccountId: automation.instagramAccountId,
      accountUsername: automation.instagramAccount.username,
    }));
  }

  async create(
    userId: string,
    organizationId: string,
    accountId: string,
    zernioPostId: string,
    input: unknown,
  ): Promise<AutomationSummary> {
    await this.requireMembership(userId, organizationId);
    const account = await this.requireOwnAccount(organizationId, accountId);

    let parsed;
    try {
      parsed = createAutomationSchema.parse(input);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException(error.issues[0]?.message ?? 'Invalid input.');
      }
      throw error;
    }

    const organization = await this.prisma.client.organization.findUniqueOrThrow({
      where: { id: organizationId },
    });
    if (!organization.zernioProfileId) {
      // Can't happen in practice - an InstagramAccount row only exists once the connect flow
      // has already set the organization's zernioProfileId (same invariant as
      // instagram.service.ts's listPosts/getPost) - but keep the type honest.
      throw new NotFoundException('Instagram account not found.');
    }

    // Enforced at our own data layer too, not just left to Zernio's 409 - mirrors Zernio's
    // own "only one active per-post automation" rule (docs/ZERNIO-INTEGRATION.md).
    const existing = await this.prisma.client.automation.findUnique({
      where: {
        instagramAccountId_zernioPostId: { instagramAccountId: accountId, zernioPostId },
      },
    });
    if (existing) {
      throw new ConflictException('An automation already exists for this post.');
    }

    let created;
    try {
      created = await this.provider.createCommentAutomation({
        zernioProfileId: organization.zernioProfileId,
        zernioAccountId: account.zernioAccountId,
        zernioPostId,
        name: parsed.name,
        keywords: parsed.keywords,
        matchMode: parsed.matchMode,
        commentReply: parsed.commentReply,
        buttons: parsed.buttons,
        dmMessage: parsed.dmMessage,
      });
    } catch (error) {
      // A post that already has an active automation created directly in Zernio's own
      // dashboard (not through this app) would 409 here even though our own pre-check above
      // found nothing - map it to the same error the pre-check would have thrown.
      if (error instanceof ZernioApiError && error.status === 409) {
        throw new ConflictException('An automation already exists for this post.');
      }
      throw error;
    }

    try {
      const automation = await this.prisma.client.automation.create({
        data: {
          organizationId,
          instagramAccountId: accountId,
          zernioAutomationId: created.zernioAutomationId,
          zernioPostId,
          name: created.name,
          keywords: created.keywords,
          matchMode: toMatchMode(created.matchMode),
          commentReply: created.commentReply,
          // Omitted (not an explicit JSON null) when empty - Prisma.JsonNull would work too,
          // but there's no need to distinguish "no buttons" from "column left at its default"
          // for this field; both mean the same thing. Cast, not a plain array literal: an
          // array of a named interface doesn't structurally match Prisma's InputJsonObject
          // index signature even though the actual values are plain JSON-safe objects.
          buttons: created.buttons.length
            ? (created.buttons as unknown as Prisma.InputJsonValue)
            : undefined,
          dmMessage: created.dmMessage,
          isActive: created.isActive,
        },
      });
      return toSummary(automation);
    } catch (error) {
      // Covers the race between the findUnique check above and this create - two concurrent
      // requests for the same post can both pass the check but only one insert wins. Zernio
      // itself already has a real automation at this point (the loser's own create call
      // above already succeeded against Zernio), so this is a local bookkeeping conflict, not
      // a full failure - same defense-in-depth pattern as instagram.service.ts's callback
      // handler.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('An automation already exists for this post.');
      }
      throw error;
    }
  }
}

function toSummary(automation: {
  id: string;
  zernioPostId: string;
  name: string;
  keywords: string[];
  matchMode: AutomationMatchMode;
  commentReply: string | null;
  buttons: Prisma.JsonValue | null;
  dmMessage: string;
  isActive: boolean;
}): AutomationSummary {
  return {
    id: automation.id,
    zernioPostId: automation.zernioPostId,
    name: automation.name,
    keywords: automation.keywords,
    matchMode: automation.matchMode,
    commentReply: automation.commentReply,
    buttons: toButtons(automation.buttons),
    dmMessage: automation.dmMessage,
    isActive: automation.isActive,
  };
}

// automation.buttons is a Prisma Json column - narrow it back to the shape this service
// itself always writes ([{ title, url }], or null/absent for "no buttons") rather than
// trusting the column's type-erased JsonValue as-is.
function toButtons(value: Prisma.JsonValue | null): AutomationButton[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (
      typeof item === 'object' &&
      item !== null &&
      !Array.isArray(item) &&
      typeof item.title === 'string' &&
      typeof item.url === 'string'
    ) {
      return [{ title: item.title, url: item.url }];
    }
    return [];
  });
}

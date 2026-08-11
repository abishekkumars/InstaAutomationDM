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
    const account = await this.requireOwnAccount(organizationId, accountId);

    const local = await this.prisma.client.automation.findMany({
      where: { instagramAccountId: accountId, zernioPostId },
    });
    if (local.length > 0) {
      return local.map(toSummary);
    }

    // Nothing locally - but Zernio is the system of record for automations (it executes them
    // server-side; see docs/ZERNIO-INTEGRATION.md), and an automation can exist there without
    // a local row: created directly in Zernio's own dashboard, or created through this app in
    // a request whose local insert failed after the Zernio call already succeeded. Reading
    // only our own table made those invisible, which is why a post with a real, working
    // automation still rendered "No automation yet".
    const reconciled = await this.reconcileFromZernio(organizationId, account, zernioPostId);
    return reconciled ? [reconciled] : [];
  }

  /** Looks this post's automation up on Zernio and, if one exists, backfills the missing local
   * row so later reads (and the org-wide dashboard list) see it too. Returns null when Zernio
   * has none either. Never throws on a Zernio failure - the caller degrades to "no automation"
   * rather than failing the whole page, since this is a read path. */
  private async reconcileFromZernio(
    organizationId: string,
    account: { id: string; zernioAccountId: string },
    zernioPostId: string,
  ): Promise<AutomationSummary | null> {
    const organization = await this.prisma.client.organization.findUniqueOrThrow({
      where: { id: organizationId },
    });
    if (!organization.zernioProfileId) {
      return null;
    }

    let remote;
    try {
      const all = await this.provider.listCommentAutomations({
        zernioProfileId: organization.zernioProfileId,
      });
      // Zernio only filters by profileId, so narrow to this account AND this post ourselves -
      // a profile can hold automations for several accounts/posts. Matching on the account too
      // (not just the post id) keeps the same tenant-isolation discipline used elsewhere.
      // Match on EITHER id. Zernio's `postId` (its own post id) is only present on automations
      // created with that field set, and `platformPostId` holds Instagram's media id - older
      // automations, and any created directly in Zernio's dashboard, may carry only one of the
      // two, so keying on just one silently misses them.
      const post = await this.provider
        .getPost({
          zernioProfileId: organization.zernioProfileId,
          zernioAccountId: account.zernioAccountId,
          zernioPostId,
        })
        .catch(() => null);
      remote = all.find(
        (item) =>
          item.zernioAccountId === account.zernioAccountId &&
          (item.zernioPostId === zernioPostId ||
            (post?.platformPostId != null && item.platformPostId === post.platformPostId)),
      );
    } catch (error) {
      console.error('[automations] Zernio reconciliation failed:', error);
      return null;
    }
    if (!remote) {
      return null;
    }

    try {
      const created = await this.prisma.client.automation.create({
        data: {
          organizationId,
          instagramAccountId: account.id,
          zernioAutomationId: remote.zernioAutomationId,
          zernioPostId,
          name: remote.name,
          keywords: remote.keywords,
          matchMode: toMatchMode(remote.matchMode),
          commentReply: remote.commentReply,
          buttons: remote.buttons.length
            ? (remote.buttons as unknown as Prisma.InputJsonValue)
            : undefined,
          dmMessage: remote.dmMessage,
          isActive: remote.isActive,
        },
      });
      return toSummary(created);
    } catch (error) {
      // A concurrent reconciliation (or create) won the race and inserted the row first. Read
      // it back instead of failing - both requests should end up reporting the same automation.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.client.automation.findUnique({
          where: { zernioAutomationId: remote.zernioAutomationId },
        });
        return existing ? toSummary(existing) : null;
      }
      throw error;
    }
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

    // Zernio needs Instagram's OWN media id in `platformPostId` (see the provider's comment) -
    // that's the id an incoming comment carries. Resolve it from the post itself rather than
    // reusing Zernio's `_id`, which is a different id entirely.
    const post = await this.provider.getPost({
      zernioProfileId: organization.zernioProfileId,
      zernioAccountId: account.zernioAccountId,
      zernioPostId,
    });
    if (!post) {
      throw new NotFoundException('Post not found.');
    }
    if (!post.platformPostId) {
      // Without it the automation could only be created account-wide, which would silently
      // apply to every post on the account - never do that implicitly.
      throw new BadRequestException(
        'This post has no Instagram media id yet, so an automation cannot be scoped to it.',
      );
    }

    let created;
    try {
      created = await this.provider.createCommentAutomation({
        zernioProfileId: organization.zernioProfileId,
        zernioAccountId: account.zernioAccountId,
        zernioPostId,
        platformPostId: post.platformPostId,
        name: parsed.name,
        keywords: parsed.keywords,
        matchMode: parsed.matchMode,
        commentReply: parsed.commentReply,
        buttons: parsed.buttons,
        dmMessage: parsed.dmMessage,
      });
    } catch (error) {
      // A post that already has an active automation created directly in Zernio's own
      // dashboard (not through this app) 409s here even though our own pre-check above found
      // nothing. Backfill the missing local row from Zernio before reporting the conflict, so
      // the next page load shows the real automation instead of "No automation yet" plus a
      // create button that can never succeed.
      if (error instanceof ZernioApiError && error.status === 409) {
        await this.reconcileFromZernio(organizationId, account, zernioPostId);
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

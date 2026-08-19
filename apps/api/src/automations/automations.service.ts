import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { AutomationAudience, AutomationMatchMode, Prisma } from '@automationdm/database';
import {
  AUTOMATION_LIMITS,
  createAutomationSchema,
  updateAutomationSchema,
} from '@automationdm/validation';
import {
  type CommentAutomation,
  type CommentAutomationStats,
  type InstagramPost,
  type InstagramProvider,
  ZernioApiError,
} from '@automationdm/zernio';
import { PrismaService } from '../database/prisma.service';
import { INSTAGRAM_PROVIDER } from '../instagram/instagram-provider.token';

export interface AutomationButton {
  title: string;
  url: string;
}

export interface AutomationSummary {
  id: string;
  /** Instagram's own media id - the pivot since Phase 17, and what the post routes key on. */
  platformPostId: string;
  name: string;
  /** Empty means "any comment triggers" (Phase 16.2, requirement 12). */
  keywords: string[];
  matchMode: AutomationMatchMode;
  /** Which commenters may be answered (Phase 16.2, requirement 11). */
  audience: AutomationAudience;
  commentReply: string | null;
  /** Alternate public replies. Zernio picks one at random per triggering comment from
   * `[commentReply, ...commentReplyVariations]` (Phase 16.2, requirement 13). */
  commentReplyVariations: string[];
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
  /** Live counters from Zernio's list endpoint (Phase 10.3). Null when Zernio is unreachable
   * or has no matching automation - the dashboard renders a dash rather than a fake 0, so a
   * failed stats fetch never reads as "this automation has sent nothing". */
  stats: AutomationStats | null;
  /** Post caption/thumbnail for the row, fetched live from Zernio (post content is never
   * stored locally - see docs/ADR/0005). Null when the post can't be resolved. */
  post: AutomationPostPreview | null;
}

export interface AutomationStats {
  dmsSent: number;
  linkClicks: number;
  /** Clicks / trackedSends, as a percentage, or null when nothing trackable was sent. Zernio's
   * own spec is explicit that trackedSends - not dmsSent - is the right denominator: a DM with
   * no tracked link can never be clicked, so dividing by dmsSent understates CTR. */
  clickThroughRate: number | null;
}

export interface AutomationPostPreview {
  caption: string;
  thumbnailUrl: string | null;
  permalink: string | null;
}

function toMatchMode(matchMode: 'contains' | 'word' | 'exact'): AutomationMatchMode {
  return matchMode.toUpperCase() as AutomationMatchMode;
}

// Zernio speaks lowercase snake_case ('non_follower'); the Prisma enum is SCREAMING_SNAKE
// ('NON_FOLLOWER'). Same shape of mapping as toMatchMode above, and the reason both exist is
// that neither vocabulary gets to dictate the other's casing.
function toAudience(audience: 'any' | 'follower' | 'non_follower'): AutomationAudience {
  return audience.toUpperCase() as AutomationAudience;
}

function toStats(stats: CommentAutomationStats): AutomationStats {
  return {
    dmsSent: stats.dmsSent,
    linkClicks: stats.linkClicks,
    // Null, not 0, when nothing trackable went out - "no trackable sends yet" and "a real 0%
    // click-through" are different facts, and dividing by zero would produce Infinity/NaN.
    clickThroughRate: stats.trackedSends > 0 ? (stats.linkClicks / stats.trackedSends) * 100 : null,
  };
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

  /** `platformPostId` is Instagram's own media id - the pivot since Phase 17. */
  async listForPost(
    userId: string,
    organizationId: string,
    accountId: string,
    platformPostId: string,
  ): Promise<AutomationSummary[]> {
    await this.requireMembership(userId, organizationId);
    const account = await this.requireOwnAccount(organizationId, accountId);

    const local = await this.prisma.client.automation.findMany({
      where: { instagramAccountId: accountId, platformPostId },
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
    const reconciled = await this.reconcileFromZernio(organizationId, account, platformPostId);
    return reconciled ? [reconciled] : [];
  }

  /** Looks this post's automation up on Zernio and, if one exists, backfills the missing local
   * row so later reads (and the org-wide dashboard list) see it too. Returns null when Zernio
   * has none either. Never throws on a Zernio failure - the caller degrades to "no automation"
   * rather than failing the whole page, since this is a read path. */
  private async reconcileFromZernio(
    organizationId: string,
    account: { id: string; zernioAccountId: string },
    platformPostId: string,
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
      //
      // Matched on `platformPostId` alone since Phase 17. The previous version also resolved
      // Zernio's own `_id` via a getPost round trip and matched either id; that round trip is
      // exactly what could not be satisfied for a post Zernio has not synced, and the media id
      // is present on every automation this project has ever created.
      remote = all.find(
        (item) =>
          item.zernioAccountId === account.zernioAccountId &&
          item.platformPostId === platformPostId,
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
          platformPostId,
          name: remote.name,
          keywords: remote.keywords,
          matchMode: toMatchMode(remote.matchMode),
          audience: toAudience(remote.audience),
          commentReply: remote.commentReply,
          commentReplyVariations: remote.commentReplyVariations,
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
      include: { instagramAccount: { select: { username: true, zernioAccountId: true } } },
      orderBy: { createdAt: 'desc' },
    });
    if (automations.length === 0) {
      return [];
    }

    const organization = await this.prisma.client.organization.findUniqueOrThrow({
      where: { id: organizationId },
    });

    // Live stats + post previews are fetched from Zernio, never stored locally (ADR 0005).
    // Both are best-effort: a Zernio outage degrades the dashboard to names/keywords/status
    // rather than failing the whole page, which is the same read-path discipline as
    // listForPost's reconciliation.
    const [remoteByAutomationId, postsByAccount] = await Promise.all([
      this.fetchRemoteAutomations(organization.zernioProfileId),
      this.fetchPostsForAccounts(
        organization.zernioProfileId,
        // One listPosts call per DISTINCT account, not per automation - several automations
        // usually share an account, and a per-row call would be N round trips for the same data.
        [...new Set(automations.map((a) => a.instagramAccount.zernioAccountId))],
      ),
    ]);

    return automations.map((automation) => {
      const remote = remoteByAutomationId.get(automation.zernioAutomationId);
      const post = postsByAccount
        .get(automation.instagramAccount.zernioAccountId)
        ?.get(automation.platformPostId);
      return {
        ...toSummary(automation),
        instagramAccountId: automation.instagramAccountId,
        accountUsername: automation.instagramAccount.username,
        // Prefer Zernio's own isActive over our stored copy: this project has no edit/pause
        // endpoint, so a toggle flipped in Zernio's dashboard would otherwise never show here.
        isActive: remote?.isActive ?? automation.isActive,
        stats: remote?.stats ? toStats(remote.stats) : null,
        post: post
          ? {
              caption: post.caption,
              thumbnailUrl: post.thumbnailUrl,
              permalink: post.permalink,
            }
          : null,
      };
    });
  }

  /** Zernio's automations for a profile, keyed by automation id. Empty map on any failure. */
  private async fetchRemoteAutomations(
    zernioProfileId: string | null,
  ): Promise<Map<string, CommentAutomation>> {
    if (!zernioProfileId) {
      return new Map();
    }
    try {
      const remote = await this.provider.listCommentAutomations({ zernioProfileId });
      return new Map(remote.map((item) => [item.zernioAutomationId, item]));
    } catch (error) {
      console.error('[automations] could not load Zernio stats:', error);
      return new Map();
    }
  }

  /** Posts per account, keyed by account id then Zernio post id. Empty map on any failure. */
  private async fetchPostsForAccounts(
    zernioProfileId: string | null,
    zernioAccountIds: string[],
  ): Promise<Map<string, Map<string, InstagramPost>>> {
    const byAccount = new Map<string, Map<string, InstagramPost>>();
    if (!zernioProfileId) {
      return byAccount;
    }

    await Promise.all(
      zernioAccountIds.map(async (zernioAccountId) => {
        try {
          // 500 is Zernio's own max and the window getPost already relies on (~12 months).
          const { posts } = await this.provider.listPosts({
            zernioProfileId,
            zernioAccountId,
            page: 1,
            limit: 500,
          });
          // Keyed on the Instagram media id since Phase 17 - the pivot automations now carry.
          // Posts Zernio reports without one cannot be matched to an automation and are
          // dropped from the map rather than keyed on null.
          byAccount.set(
            zernioAccountId,
            new Map(
              posts
                .filter((post): post is InstagramPost & { platformPostId: string } =>
                  Boolean(post.platformPostId),
                )
                .map((post) => [post.platformPostId, post]),
            ),
          );
        } catch (error) {
          console.error('[automations] could not load posts for the dashboard:', error);
        }
      }),
    );
    return byAccount;
  }

  /** `platformPostId` is Instagram's own media id, taken straight from the post listing. */
  async create(
    userId: string,
    organizationId: string,
    accountId: string,
    platformPostId: string,
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
        instagramAccountId_platformPostId: { instagramAccountId: accountId, platformPostId },
      },
    });
    if (existing) {
      throw new ConflictException('An automation already exists for this post.');
    }

    // No getPost round trip here any more (Phase 17). It previously existed only to translate
    // Zernio's `_id` into Instagram's media id - and it was the single thing that made a
    // freshly published reel unautomatable, because Zernio cannot resolve a post it has not
    // synced yet. The media id now arrives from the listing directly.
    //
    // Not re-validating that the post exists is deliberate. `platformPostId` comes from a
    // listing this same organization is authorised to read, and Zernio scopes the automation to
    // this account's own `accountId` regardless - an automation pointed at a media id belonging
    // to someone else's account can never receive that account's comment webhooks, so it is
    // inert rather than dangerous. Re-validating would reintroduce exactly the dependency this
    // phase removed.
    let created;
    try {
      created = await this.provider.createCommentAutomation({
        zernioProfileId: organization.zernioProfileId,
        zernioAccountId: account.zernioAccountId,
        // `postId` deliberately omitted - verified 2026-08-19 that Zernio accepts
        // `platformPostId` alone and the automation fires. See packages/zernio's
        // CreateCommentAutomationInput.
        platformPostId,
        name: parsed.name,
        keywords: parsed.keywords,
        matchMode: parsed.matchMode,
        audience: parsed.audience,
        commentReply: parsed.commentReply,
        commentReplyVariations: parsed.commentReplyVariations,
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
        await this.reconcileFromZernio(organizationId, account, platformPostId);
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
          platformPostId,
          name: created.name,
          keywords: created.keywords,
          matchMode: toMatchMode(created.matchMode),
          audience: toAudience(created.audience),
          commentReply: created.commentReply,
          commentReplyVariations: created.commentReplyVariations,
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

  /** Loads an automation and proves the caller's organization owns it.
   *
   * The id arrives from the client, so it is never trusted on its own - the row is re-checked
   * against the organizationId derived from the session. 404 (not 403) for a row belonging to
   * another org, so an outsider cannot use the response to confirm the id exists. */
  private async requireOwnAutomation(userId: string, organizationId: string, automationId: string) {
    await this.requireMembership(userId, organizationId);
    const automation = await this.prisma.client.automation.findUnique({
      where: { id: automationId },
    });
    if (!automation || automation.organizationId !== organizationId) {
      throw new NotFoundException('Automation not found.');
    }
    return automation;
  }

  async update(
    userId: string,
    organizationId: string,
    automationId: string,
    input: unknown,
  ): Promise<AutomationSummary> {
    const automation = await this.requireOwnAutomation(userId, organizationId, automationId);

    let parsed;
    try {
      parsed = updateAutomationSchema.parse(input);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException(error.issues[0]?.message ?? 'Invalid input.');
      }
      throw error;
    }

    // The conditional 640-char rule spans two fields that a partial update need not send
    // together, so updateAutomationSchema can only check it when both arrive in the same
    // request. This is the only place the full picture exists: what the automation will look
    // like AFTER the patch is the stored row overlaid with whichever fields were sent. Without
    // this, changing only dmMessage on an automation that already has buttons stored would sail
    // past validation and be rejected by Zernio instead, as an opaque 400.
    const effectiveButtons = parsed.buttons ?? toButtons(automation.buttons);
    const effectiveDmMessage = parsed.dmMessage ?? automation.dmMessage;
    if (
      effectiveButtons.length > 0 &&
      effectiveDmMessage.length > AUTOMATION_LIMITS.dmMessageWithButtonsMax
    ) {
      throw new BadRequestException(
        `DM message must be ${AUTOMATION_LIMITS.dmMessageWithButtonsMax} characters or fewer when buttons are added.`,
      );
    }

    let updated: CommentAutomation;
    try {
      updated = await this.provider.updateCommentAutomation({
        zernioAutomationId: automation.zernioAutomationId,
        name: parsed.name,
        keywords: parsed.keywords,
        matchMode: parsed.matchMode,
        audience: parsed.audience,
        commentReply: parsed.commentReply,
        commentReplyVariations: parsed.commentReplyVariations,
        buttons: parsed.buttons,
        dmMessage: parsed.dmMessage,
        isActive: parsed.isActive,
      });
    } catch (error) {
      // The local row points at an automation Zernio no longer has (deleted directly in Zernio's
      // own dashboard). Reported rather than self-healed by deleting the row: dropping a user's
      // configuration as a side effect of a failed edit is a worse outcome than a stale row,
      // which the dashboard's next reconcile pass can resolve.
      if (error instanceof ZernioApiError && error.status === 404) {
        throw new NotFoundException('This automation no longer exists on Zernio.');
      }
      throw error;
    }

    // Written back from Zernio's response, not from `parsed`: Zernio is the source of truth and
    // may normalize what it stores, so echoing the request would let the two drift.
    const saved = await this.prisma.client.automation.update({
      where: { id: automationId },
      data: {
        name: updated.name,
        keywords: updated.keywords,
        matchMode: toMatchMode(updated.matchMode),
        audience: toAudience(updated.audience),
        commentReply: updated.commentReply,
        commentReplyVariations: updated.commentReplyVariations,
        // DbNull, not undefined: on update, "no buttons" has to be able to CLEAR the stored ones.
        // `undefined` means "leave this column alone" to Prisma, which is exactly the bug -
        // removing every button would appear to succeed on Zernio and silently do nothing here.
        buttons: updated.buttons.length
          ? (updated.buttons as unknown as Prisma.InputJsonValue)
          : Prisma.DbNull,
        dmMessage: updated.dmMessage,
        isActive: updated.isActive,
      },
    });
    return toSummary(saved);
  }

  async remove(userId: string, organizationId: string, automationId: string): Promise<void> {
    const automation = await this.requireOwnAutomation(userId, organizationId, automationId);

    try {
      await this.provider.deleteCommentAutomation({
        zernioAutomationId: automation.zernioAutomationId,
      });
    } catch (error) {
      // Already gone on Zernio's side - fall through to the local delete rather than failing.
      // Here (unlike update) removing the local row is precisely what the user asked for, so a
      // 404 means the desired end state is already half-achieved, not that the request is bad.
      if (!(error instanceof ZernioApiError && error.status === 404)) {
        throw error;
      }
      console.error('[automations] automation already absent from Zernio, deleting locally:', {
        automationId,
      });
    }

    await this.prisma.client.automation.delete({ where: { id: automationId } });
  }
}

function toSummary(automation: {
  id: string;
  platformPostId: string;
  name: string;
  keywords: string[];
  matchMode: AutomationMatchMode;
  audience: AutomationAudience;
  commentReply: string | null;
  commentReplyVariations: string[];
  buttons: Prisma.JsonValue | null;
  dmMessage: string;
  isActive: boolean;
}): AutomationSummary {
  return {
    id: automation.id,
    platformPostId: automation.platformPostId,
    name: automation.name,
    keywords: automation.keywords,
    matchMode: automation.matchMode,
    audience: automation.audience,
    commentReply: automation.commentReply,
    commentReplyVariations: automation.commentReplyVariations,
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

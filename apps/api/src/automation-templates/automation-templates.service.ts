import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import {
  AutomationAudience,
  AutomationMatchMode,
  Prisma,
  TemplateTriggerType,
  type AutomationTemplate,
} from '@automationdm/database';
import {
  TEMPLATE_LIMITS,
  automationTemplateSchema,
  type AutomationTemplateInput,
} from '@automationdm/validation';
import { PrismaService } from '../database/prisma.service';

/** What the API returns for a template (Phase 19).
 *
 * Unlike AutomationSummary, the enum fields use the form's lowercase vocabulary ('contains',
 * 'non_follower', 'any'), the same values `automationTemplateSchema` accepts. The editor reads a
 * template, changes it, and PUTs the same shape straight back, with no case mapping in
 * apps/web. */
export interface AutomationTemplateSummary {
  id: string;
  name: string;
  triggerType: 'keywords' | 'any';
  keywords: string[];
  matchMode: 'contains' | 'word' | 'exact';
  audience: 'any' | 'follower' | 'non_follower';
  commentReply: string | null;
  commentReplyVariations: string[];
  dmMessage: string | null;
  buttons: { title: string; url: string }[];
  isActive: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

type Tx = Prisma.TransactionClient;

/** Organization-wide automation templates (Phase 19). See the AutomationTemplate model in
 * packages/database/prisma/schema.prisma.
 *
 * **The one-default rule.** An organization with any templates has exactly one default. The
 * first template created becomes it; "set default" moves it; deleting it hands it to the oldest
 * remaining template. Every write that can affect the rule runs through `inOrganizationLock`,
 * which serialises template writes per organization by locking the organization row. Without
 * the lock, two people saving their first template at the same moment could both see "no
 * templates yet" and both become the default.
 *
 * Any member may manage templates. They are shared working material, like automations, and
 * the app has no finer-grained permissions than membership. */
@Injectable()
export class AutomationTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  // Same 404-not-403 discipline as AutomationsService: a non-member cannot tell "no such
  // organization" from "not yours".
  private async requireMembership(userId: string, organizationId: string): Promise<void> {
    const membership = await this.prisma.client.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    if (!membership) {
      throw new NotFoundException('Organization not found.');
    }
  }

  /** Runs `work` in a transaction holding a row lock on the organization. Other template writes
   * for the same organization wait for it; other organizations are unaffected. */
  private inOrganizationLock<T>(organizationId: string, work: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "organizations" WHERE id = ${organizationId} FOR UPDATE`;
      return work(tx);
    });
  }

  /** The template, proven to belong to `organizationId`. The id comes from the client, so a row
   * from another organization gets the same 404 as a missing one. */
  private async requireOwnTemplate(
    tx: Tx,
    organizationId: string,
    templateId: string,
  ): Promise<AutomationTemplate> {
    const template = await tx.automationTemplate.findUnique({ where: { id: templateId } });
    if (!template || template.organizationId !== organizationId) {
      throw new NotFoundException('Template not found.');
    }
    return template;
  }

  private async assertBelowCap(tx: Tx, organizationId: string): Promise<number> {
    const count = await tx.automationTemplate.count({ where: { organizationId } });
    if (count >= TEMPLATE_LIMITS.perOrganizationMax) {
      throw new BadRequestException(
        `An organization can have up to ${TEMPLATE_LIMITS.perOrganizationMax} templates. Delete one first.`,
      );
    }
    return count;
  }

  /** Oldest first, so the list is stable and matches how the default is chosen. */
  async list(userId: string, organizationId: string): Promise<AutomationTemplateSummary[]> {
    await this.requireMembership(userId, organizationId);
    const templates = await this.prisma.client.automationTemplate.findMany({
      where: { organizationId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return templates.map(toSummary);
  }

  async create(
    userId: string,
    organizationId: string,
    input: unknown,
  ): Promise<AutomationTemplateSummary> {
    await this.requireMembership(userId, organizationId);
    const parsed = parseInput(input);

    return this.inOrganizationLock(organizationId, async (tx) => {
      const existing = await this.assertBelowCap(tx, organizationId);
      const created = await tx.automationTemplate.create({
        data: { organizationId, ...toData(parsed), isDefault: existing === 0 },
      });
      return toSummary(created);
    });
  }

  /** A full replace of the template's fields. `isDefault` is not part of the body and never
   * changes here - only `setDefault` and `remove` move it. */
  async update(
    userId: string,
    organizationId: string,
    templateId: string,
    input: unknown,
  ): Promise<AutomationTemplateSummary> {
    await this.requireMembership(userId, organizationId);
    const parsed = parseInput(input);

    return this.inOrganizationLock(organizationId, async (tx) => {
      await this.requireOwnTemplate(tx, organizationId, templateId);
      const updated = await tx.automationTemplate.update({
        where: { id: templateId },
        data: toData(parsed),
      });
      return toSummary(updated);
    });
  }

  async setDefault(
    userId: string,
    organizationId: string,
    templateId: string,
  ): Promise<AutomationTemplateSummary> {
    await this.requireMembership(userId, organizationId);

    return this.inOrganizationLock(organizationId, async (tx) => {
      await this.requireOwnTemplate(tx, organizationId, templateId);
      await tx.automationTemplate.updateMany({
        where: { organizationId, isDefault: true, NOT: { id: templateId } },
        data: { isDefault: false },
      });
      const updated = await tx.automationTemplate.update({
        where: { id: templateId },
        data: { isDefault: true },
      });
      return toSummary(updated);
    });
  }

  /** Copies every field into a new, non-default template named "Copy of <name>". */
  async clone(
    userId: string,
    organizationId: string,
    templateId: string,
  ): Promise<AutomationTemplateSummary> {
    await this.requireMembership(userId, organizationId);

    return this.inOrganizationLock(organizationId, async (tx) => {
      const source = await this.requireOwnTemplate(tx, organizationId, templateId);
      await this.assertBelowCap(tx, organizationId);
      const created = await tx.automationTemplate.create({
        data: {
          organizationId,
          name: `Copy of ${source.name}`.slice(0, TEMPLATE_LIMITS.nameMax),
          triggerType: source.triggerType,
          keywords: source.keywords,
          matchMode: source.matchMode,
          audience: source.audience,
          commentReply: source.commentReply,
          commentReplyVariations: source.commentReplyVariations,
          dmMessage: source.dmMessage,
          buttons:
            source.buttons === null
              ? Prisma.DbNull
              : (source.buttons as unknown as Prisma.InputJsonValue),
          isActive: source.isActive,
          isDefault: false,
        },
      });
      return toSummary(created);
    });
  }

  /** Deletes the template. If it was the default, the oldest remaining template takes over, so
   * the organization is never left with templates but no default. Automations created from it
   * are untouched: they never referenced it. */
  async remove(userId: string, organizationId: string, templateId: string): Promise<void> {
    await this.requireMembership(userId, organizationId);

    await this.inOrganizationLock(organizationId, async (tx) => {
      const template = await this.requireOwnTemplate(tx, organizationId, templateId);
      await tx.automationTemplate.delete({ where: { id: templateId } });
      if (!template.isDefault) {
        return;
      }
      const successor = await tx.automationTemplate.findFirst({
        where: { organizationId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      if (successor) {
        await tx.automationTemplate.update({
          where: { id: successor.id },
          data: { isDefault: true },
        });
      }
    });
  }
}

function parseInput(input: unknown): AutomationTemplateInput {
  try {
    return automationTemplateSchema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new BadRequestException(error.issues[0]?.message ?? 'Invalid input.');
    }
    throw error;
  }
}

function toData(parsed: AutomationTemplateInput) {
  return {
    name: parsed.name,
    triggerType:
      parsed.triggerType === 'any' ? TemplateTriggerType.ANY_COMMENT : TemplateTriggerType.KEYWORDS,
    keywords: parsed.keywords,
    matchMode: parsed.matchMode.toUpperCase() as AutomationMatchMode,
    audience: parsed.audience.toUpperCase() as AutomationAudience,
    // null, not undefined: on update a cleared field must actually clear the stored value.
    commentReply: parsed.commentReply ?? null,
    commentReplyVariations: parsed.commentReplyVariations,
    dmMessage: parsed.dmMessage ?? null,
    buttons: parsed.buttons.length
      ? (parsed.buttons as unknown as Prisma.InputJsonValue)
      : Prisma.DbNull,
    isActive: parsed.isActive,
  };
}

function toSummary(template: AutomationTemplate): AutomationTemplateSummary {
  return {
    id: template.id,
    name: template.name,
    triggerType: template.triggerType === TemplateTriggerType.ANY_COMMENT ? 'any' : 'keywords',
    keywords: template.keywords,
    matchMode: template.matchMode.toLowerCase() as AutomationTemplateSummary['matchMode'],
    audience: template.audience.toLowerCase() as AutomationTemplateSummary['audience'],
    commentReply: template.commentReply,
    commentReplyVariations: template.commentReplyVariations,
    dmMessage: template.dmMessage,
    buttons: toButtons(template.buttons),
    isActive: template.isActive,
    isDefault: template.isDefault,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
  };
}

/** Narrows the JSON column back to the `[{ title, url }]` shape this service writes. */
function toButtons(value: Prisma.JsonValue | null): { title: string; url: string }[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) =>
    typeof item === 'object' &&
    item !== null &&
    !Array.isArray(item) &&
    typeof item.title === 'string' &&
    typeof item.url === 'string'
      ? [{ title: item.title, url: item.url }]
      : [],
  );
}

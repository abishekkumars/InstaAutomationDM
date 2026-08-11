// One-time repair script - NOT part of the app. Fixes a specific post left orphaned by a
// prior bug: Zernio's createCommentAutomation call succeeded, but the local DB insert that
// should have followed it failed (stale Prisma Client after a migration - see
// docs/DEVELOPMENT-SETUP.md), so Zernio has the automation and this app's database does not.
// Every retry since then has 409'd because Zernio itself now blocks a second per-post
// automation, with no local row to show for it.
//
// Deleted after use - this is a repair for one incident, not a reusable feature. General
// reconciliation-on-409 was deliberately NOT added to automations.service.ts: an existing
// test (`rejects when Zernio already has an automation for this post that our database does
// not know about`) encodes that an automation Zernio knows about that we don't (e.g. one made
// directly in Zernio's own dashboard) should stay blocked, not silently adopted. This script
// bypasses that policy on purpose, once, because the automation here actually is ours.
import { PrismaClient } from '@prisma/client';

// Zernio's own post id - unaffected by the local DB reset (2026-08-12) that wiped every
// organization/account row this script originally hardcoded by id. Looks up whichever
// organization/account currently owns this Zernio profile+account instead, since this app
// only ever has one real organization in practice (same assumption apps/web's own pages make -
// "there is no multi-org switcher yet").
const ZERNIO_POST_ID = '6a7b537577555aae01bfc238';

const ZERNIO_BASE_URL = 'https://zernio.com/api/v1';

const prisma = new PrismaClient();

async function main() {
  const apiKey = process.env.ZERNIO_API_KEY;
  if (!apiKey) {
    throw new Error('ZERNIO_API_KEY is not set.');
  }

  const account = await prisma.instagramAccount.findFirst({
    orderBy: { createdAt: 'asc' },
  });
  if (!account) {
    throw new Error('No connected Instagram account found - reconnect Instagram first.');
  }

  const organization = await prisma.organization.findUnique({
    where: { id: account.organizationId },
  });
  if (!organization?.zernioProfileId) {
    throw new Error('Organization has no zernioProfileId.');
  }

  const existing = await prisma.automation.findUnique({
    where: {
      instagramAccountId_zernioPostId: {
        instagramAccountId: account.id,
        zernioPostId: ZERNIO_POST_ID,
      },
    },
  });
  if (existing) {
    console.log('[reconcile] A local row already exists - nothing to do:', existing.id);
    return;
  }

  const query = new URLSearchParams({ profileId: organization.zernioProfileId });
  const response = await fetch(`${ZERNIO_BASE_URL}/comment-automations?${query.toString()}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    throw new Error(`Zernio list call failed: ${response.status} ${await response.text()}`);
  }
  const body = await response.json();

  const match = body.automations.find(
    (a) => a.accountId === account.zernioAccountId && a.platformPostId === ZERNIO_POST_ID,
  );
  if (!match) {
    throw new Error(
      `No Zernio automation found for accountId=${account.zernioAccountId} platformPostId=${ZERNIO_POST_ID}. ` +
        `Automations seen: ${JSON.stringify(body.automations.map((a) => ({ id: a.id, accountId: a.accountId, platformPostId: a.platformPostId })))}`,
    );
  }

  const buttons = (match.buttons ?? [])
    .filter((b) => b.type === 'url' && b.title && b.url)
    .map((b) => ({ title: b.title, url: b.url }));

  const created = await prisma.automation.create({
    data: {
      organizationId: account.organizationId,
      instagramAccountId: account.id,
      zernioAutomationId: match.id,
      zernioPostId: ZERNIO_POST_ID,
      name: match.name,
      keywords: match.keywords ?? [],
      matchMode: (match.matchMode ?? 'contains').toUpperCase(),
      commentReply: match.commentReply ?? null,
      buttons: buttons.length ? buttons : undefined,
      dmMessage: match.dmMessage,
      isActive: match.isActive ?? true,
    },
  });
  console.log('[reconcile] Backfilled local automation row:', created.id, created.name);
}

main()
  .catch((error) => {
    console.error('[reconcile] Failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

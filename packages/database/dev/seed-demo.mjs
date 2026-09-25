// Local-only demo data for UI testing (Phase 18): a separate "Demo (test data)" organization with a
// fake Instagram account and 18 varied automations, and the given user(s) added as members so it
// appears in their organization switcher. Nothing here touches Zernio, Meta or Instagram.
//
//   scripts/pnpm.ps1 --filter @automationdm/database run seed:demo -- --email you@example.com
//   scripts/pnpm.ps1 --filter @automationdm/database run seed:demo -- --remove
//
// Without --email, every ADMIN user is added. Re-running replaces the demo account and automations
// (idempotent); --remove deletes the demo organization and everything under it.
//
// What to expect in the app: the organization has no Zernio profile, so apps/api skips Zernio
// entirely when listing its automations (automations.service listForOrganization). The listing,
// search, filters, counts and dashboard health read from these rows; DMs/clicks show "—" and there
// are no thumbnails, because those only ever come live from Zernio. Anything that has to call
// Zernio - the posts grid, post detail, enabling/pausing, editing - fails for this organization,
// which is also how the error paths get exercised.
import { PrismaClient } from '@prisma/client';

const SLUG = 'demo-test-data';
const ACCOUNT_ZERNIO_ID = 'demo-zernio-account';

const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
if (!url || !['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)) {
  console.error('[seed-demo] Refusing to run: DATABASE_URL is not a localhost database.');
  process.exit(1);
}
if (url.pathname.replace(/^\//, '').endsWith('_test')) {
  console.error('[seed-demo] Refusing to run against the test database - the suites wipe it.');
  process.exit(1);
}

const args = process.argv.slice(2);
const remove = args.includes('--remove');
const emailIndex = args.indexOf('--email');
const email = emailIndex >= 0 ? args[emailIndex + 1] : undefined;

// name, keywords ([] = any comment), matchMode, audience, isActive, commentReply, dmMessage, buttons
const AUTOMATIONS = [
  [
    'Summer drop lookbook',
    ['link', 'lookbook'],
    'CONTAINS',
    'ANY',
    true,
    'Sent you the lookbook!',
    'Hey! Here is the full summer lookbook you asked for.',
    [{ title: 'Open lookbook', url: 'https://example.com/lookbook' }],
  ],
  [
    'Free guide: 5 reel hooks',
    ['guide'],
    'WORD',
    'ANY',
    true,
    null,
    'Here is your free PDF with all 5 hooks.',
    [{ title: 'Download guide', url: 'https://example.com/guide' }],
  ],
  [
    'Bridal package prices',
    ['price', 'cost', 'rates'],
    'CONTAINS',
    'ANY',
    true,
    'Check your DMs',
    'Thanks for asking! Our 2027 bridal packages are here.',
    [{ title: 'See packages', url: 'https://example.com/bridal' }],
  ],
  [
    'Giveaway entry confirmation',
    [],
    'CONTAINS',
    'FOLLOWER',
    true,
    'You are in!',
    'You are in! Winners are announced Friday.',
    [],
  ],
  [
    'October workshop waitlist',
    ['waitlist', 'join'],
    'WORD',
    'ANY',
    false,
    null,
    'You are on the list. We will message you when seats open.',
    [{ title: 'Workshop details', url: 'https://example.com/workshop' }],
  ],
  [
    'BTS preset pack',
    ['preset'],
    'EXACT',
    'ANY',
    true,
    null,
    'Here is the preset from today’s shoot.',
    [{ title: 'Get preset', url: 'https://example.com/preset' }],
  ],
  [
    'Studio tour booking',
    ['book', 'tour'],
    'CONTAINS',
    'ANY',
    false,
    null,
    'Pick a tour slot that works for you.',
    [],
  ],
  [
    'Discount code for new followers',
    ['code'],
    'WORD',
    'NON_FOLLOWER',
    true,
    'Code sent!',
    'Welcome! Use WELCOME10 for 10% off your first order.',
    [{ title: 'Shop now', url: 'https://example.com/shop' }],
  ],
  [
    'Restock alert signup',
    ['restock', 'notify'],
    'CONTAINS',
    'ANY',
    true,
    null,
    'We will ping you the moment it is back.',
    [],
  ],
  [
    'Recipe card',
    ['recipe'],
    'WORD',
    'ANY',
    true,
    'Recipe on its way',
    'Here is the full recipe card with quantities.',
    [
      { title: 'Open recipe', url: 'https://example.com/recipe' },
      { title: 'Grocery list', url: 'https://example.com/list' },
    ],
  ],
  [
    'Location details',
    ['location', 'where', 'link'],
    'CONTAINS',
    'ANY',
    true,
    'Sent to your DMs!',
    'Here is the exact location and opening hours.',
    [{ title: 'Open in Maps', url: 'https://example.com/maps' }],
  ],
  [
    'Podcast episode link',
    ['episode'],
    'WORD',
    'ANY',
    false,
    null,
    'Here is the full episode.',
    [{ title: 'Listen', url: 'https://example.com/podcast' }],
  ],
  [
    'Size guide',
    ['size', 'fit'],
    'CONTAINS',
    'ANY',
    true,
    null,
    'Here is our size guide - most people size up.',
    [{ title: 'Size guide', url: 'https://example.com/sizes' }],
  ],
  [
    'Webinar registration',
    ['webinar'],
    'EXACT',
    'FOLLOWER',
    true,
    null,
    'You are registered for Thursday 7pm.',
    [{ title: 'Add to calendar', url: 'https://example.com/cal' }],
  ],
  [
    'Collab inquiries',
    ['collab', 'partner'],
    'CONTAINS',
    'ANY',
    false,
    null,
    'Thanks! Send your media kit to the address below.',
    [],
  ],
  [
    'Tutorial full video',
    [],
    'CONTAINS',
    'ANY',
    true,
    null,
    'Here is the full-length tutorial.',
    [{ title: 'Watch', url: 'https://example.com/tutorial' }],
  ],
  [
    'Menu and prices',
    ['menu'],
    'WORD',
    'ANY',
    true,
    'Menu sent!',
    'Here is this week’s menu.',
    [{ title: 'View menu', url: 'https://example.com/menu' }],
  ],
  [
    'Early access list',
    ['early', 'access', 'vip'],
    'CONTAINS',
    'NON_FOLLOWER',
    true,
    null,
    'You are on the early-access list.',
    [],
  ],
];

const prisma = new PrismaClient();

async function main() {
  if (remove) {
    const deleted = await prisma.organization.deleteMany({ where: { slug: SLUG } });
    console.log(
      `[seed-demo] Removed ${deleted.count} demo organization(s) and everything under them.`,
    );
    return;
  }

  const users = email
    ? await prisma.user.findMany({ where: { email } })
    : await prisma.user.findMany({ where: { role: 'ADMIN' } });
  if (users.length === 0) {
    throw new Error(
      email
        ? `No user with email ${email} - sign up in the app first.`
        : 'No ADMIN user found - pass --email.',
    );
  }

  const organization = await prisma.organization.upsert({
    where: { slug: SLUG },
    update: { name: 'Demo (test data)' },
    // No zernioProfileId on purpose: apps/api then never calls Zernio for this organization.
    create: { name: 'Demo (test data)', slug: SLUG },
  });

  for (const user of users) {
    await prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId: organization.id, userId: user.id } },
      update: {},
      create: { organizationId: organization.id, userId: user.id, role: 'OWNER' },
    });
  }

  // Replace, don't merge: the automations cascade with the account.
  await prisma.instagramAccount.deleteMany({ where: { organizationId: organization.id } });
  const account = await prisma.instagramAccount.create({
    data: {
      organizationId: organization.id,
      zernioAccountId: ACCOUNT_ZERNIO_ID,
      username: 'demo.studio',
      status: 'CONNECTED',
    },
  });

  // Spread createdAt so the list's newest-first order is stable and looks lived-in.
  const now = Date.now();
  for (const [index, row] of AUTOMATIONS.entries()) {
    const [name, keywords, matchMode, audience, isActive, commentReply, dmMessage, buttons] = row;
    const n = String(index + 1).padStart(2, '0');
    await prisma.automation.create({
      data: {
        organizationId: organization.id,
        instagramAccountId: account.id,
        zernioAutomationId: `demo-automation-${n}`,
        platformPostId: `demo-post-${n}`,
        name,
        keywords,
        matchMode,
        audience,
        isActive,
        commentReply,
        commentReplyVariations: [],
        dmMessage,
        buttons,
        createdAt: new Date(now - index * 36e5),
      },
    });
  }

  console.log(
    `[seed-demo] "${organization.name}" ready: @${account.username}, ${AUTOMATIONS.length} automations ` +
      `(${AUTOMATIONS.filter((row) => row[4]).length} active). Members: ${users.map((user) => user.email).join(', ')}.`,
  );
  console.log(
    '[seed-demo] Switch to it with the organization switcher (sidebar, or mobile Settings).',
  );
}

main()
  .catch((error) => {
    console.error('[seed-demo] Error:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

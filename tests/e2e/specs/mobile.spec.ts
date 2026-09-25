import { expect, test } from '@playwright/test';
import {
  E2E_ACTIVE_COUNT,
  E2E_AUTOMATIONS,
  E2E_HANDLE,
  E2E_ORG_NAME,
  E2E_PAUSED_COUNT,
} from '../fixtures';
import { scrollContent, signIn } from './helpers';

// Runs with a Pixel 7 user agent and viewport (playwright.config.ts), so the server renders the
// mobile view - docs/ADR/0010-device-specific-views.md.

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test('templates: the first is the default, and clone, set default and delete move it', async ({
  page,
}) => {
  // Starts from no templates: global-setup.ts clears them, and every template test deletes its
  // last one before it ends.
  await page.goto('/templates');
  await expect(page.getByRole('heading', { name: 'No templates yet' })).toBeVisible();

  await page.getByRole('button', { name: 'Create template' }).click();
  const editor = page.getByRole('dialog', { name: 'Create template' });
  await expect(editor.getByText('This will be your default template.')).toBeVisible();
  await editor.getByLabel('Template name').fill('Price enquiry');
  await editor.getByPlaceholder('Type a keyword and press Enter').fill('price');
  await editor.getByPlaceholder('Type a keyword and press Enter').press('Enter');
  await editor.getByLabel('DM message').fill('Here is the price list.');
  await editor.getByRole('button', { name: 'Save template' }).click();
  await expect(editor).toBeHidden();

  const card = (name: string) => page.locator('article').filter({ hasText: name });
  await expect(card('Price enquiry')).toContainText('Default');
  await expect(card('Price enquiry')).toContainText('price');

  // Clone - the copy is not the default.
  await page.getByRole('button', { name: 'Actions for Price enquiry' }).click();
  await page
    .getByRole('dialog', { name: 'Actions for Price enquiry' })
    .getByRole('button', { name: 'Clone' })
    .click();
  await expect(card('Copy of Price enquiry')).toBeVisible();
  await expect(card('Copy of Price enquiry')).not.toContainText('Default');

  // Set the copy as default - the tag moves.
  await page.getByRole('button', { name: 'Actions for Copy of Price enquiry' }).click();
  await page
    .getByRole('dialog', { name: 'Actions for Copy of Price enquiry' })
    .getByRole('button', { name: 'Set as default' })
    .click();
  await expect(card('Copy of Price enquiry')).toContainText('Default');
  await expect(
    page.locator('article').filter({ has: page.getByText('Default', { exact: true }) }),
  ).toHaveCount(1);

  // Delete the default - the confirmation names the successor, which then carries the tag.
  await page.getByRole('button', { name: 'Actions for Copy of Price enquiry' }).click();
  await page
    .getByRole('dialog', { name: 'Actions for Copy of Price enquiry' })
    .getByRole('button', { name: 'Delete' })
    .click();
  const confirm = page.getByRole('dialog', { name: 'Delete template' });
  await expect(confirm).toContainText('"Price enquiry" becomes the new default.');
  await confirm.getByRole('button', { name: 'Delete template' }).click();
  await expect(page.locator('article')).toHaveCount(1);
  await expect(card('Price enquiry')).toContainText('Default');

  // Delete the last one too, so the next template test starts from the empty state.
  await page.getByRole('button', { name: 'Actions for Price enquiry' }).click();
  await page
    .getByRole('dialog', { name: 'Actions for Price enquiry' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(confirm).toContainText('There will be no template left');
  await confirm.getByRole('button', { name: 'Delete template' }).click();
  await expect(page.getByRole('heading', { name: 'No templates yet' })).toBeVisible();
});

test('the glass tab bar navigates between all five tabs', async ({ page }) => {
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Listing' })).toHaveAttribute('aria-current', 'page');

  await nav.getByRole('link', { name: 'Dashboard' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  await nav.getByRole('link', { name: 'Templates' }).click();
  await expect(page).toHaveURL(/\/templates$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Templates' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Templates' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  await nav.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();

  // Status left the tab bar in Phase 19: it opens from Settings, which stays highlighted.
  await expect(nav.getByRole('link', { name: 'Status' })).toHaveCount(0);
  await page.getByRole('link', { name: /^Status/ }).click();
  await expect(page).toHaveURL(/\/status$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Status' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('link', { name: 'Back to settings' }).first().click();
  await expect(page).toHaveURL(/\/settings$/);

  // The + opens the posts grid for the organization's connected account.
  await nav.getByRole('link', { name: 'New automation: view posts' }).click();
  await expect(page).toHaveURL(/\/instagram\/posts\?accountId=/);
  await expect(page.getByRole('heading', { level: 1, name: 'Choose a post' })).toBeVisible();

  await nav.getByRole('link', { name: 'Listing' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('the listing shows every automation, filters by status and searches', async ({ page }) => {
  await expect(page.getByText(`@${E2E_HANDLE}`)).toBeVisible();
  const switches = page.getByRole('switch', { name: /^Enabled: / });
  await expect(switches).toHaveCount(E2E_AUTOMATIONS.length);

  const filters = page.getByRole('group', { name: 'Filter automations' });
  await filters.getByRole('button', { name: /^Paused/ }).click();
  await expect(switches).toHaveCount(E2E_PAUSED_COUNT);
  await filters.getByRole('button', { name: /^Active/ }).click();
  await expect(switches).toHaveCount(E2E_ACTIVE_COUNT);
  await filters.getByRole('button', { name: /^All/ }).click();

  await page.getByRole('searchbox', { name: 'Search automations' }).fill('recipe');
  await expect(switches).toHaveCount(1);
  await expect(page.getByRole('switch', { name: 'Enabled: Recipe card' })).toBeVisible();
});

test('searching from the collapsed header keeps focus while the list shrinks', async ({ page }) => {
  // Regression for the design-review bug: filtering shortened the page, the large header
  // scrolled back into view, and the compact header went inert - dropping focus mid-typing.
  await expect(page.getByRole('switch', { name: /^Enabled: / })).toHaveCount(
    E2E_AUTOMATIONS.length,
  );
  await scrollContent(page, 2000);
  const openSearch = page.getByRole('button', { name: 'Search automations' });
  await expect(openSearch).toBeVisible();
  await openSearch.click();

  const compactSearch = page.getByRole('searchbox', { name: 'Search automations' }).last();
  await expect(compactSearch).toBeFocused();
  await compactSearch.pressSequentially('no such automation');
  await expect(page.getByText('No automations match your search.')).toBeVisible();
  await expect(compactSearch).toBeFocused();
  await expect(compactSearch).toHaveValue('no such automation');
});

test('the enable switch rolls back with a message when saving fails', async ({ page }) => {
  // The save is a Next server action. Aborting it in the browser simulates a lost connection
  // without sending anything to Zernio - the seeded automations do not exist there.
  await page.route('**/*', (route) =>
    route.request().method() === 'POST' && route.request().headers()['next-action']
      ? route.abort('internetdisconnected')
      : route.fallback(),
  );

  const first = page.getByRole('switch', { name: `Enabled: ${E2E_AUTOMATIONS[0]![0]}` });
  await expect(first).toHaveAttribute('aria-checked', 'true');
  await first.click();
  // Filtered: Next's own route announcer is also role="alert".
  await expect(page.getByRole('alert').filter({ hasText: /Could not pause/ })).toBeVisible();
  await expect(first).toHaveAttribute('aria-checked', 'true');
});

test('the theme picker switches and remembers light, dark and system', async ({ page }) => {
  await page.goto('/settings');
  const theme = page.getByRole('group', { name: 'Color theme' });

  await theme.getByRole('button', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(theme.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');

  await theme.getByRole('button', { name: 'Light' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await theme.getByRole('button', { name: 'System' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
});

test('settings shows the account and signs out after confirming', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByText(E2E_ORG_NAME).first()).toBeVisible();
  await expect(page.getByText(`@${E2E_HANDLE}`)).toBeVisible();

  const openSheet = page.getByRole('button', { name: 'Sign out', exact: true });
  await openSheet.click();
  const sheet = page.getByRole('dialog', { name: 'Sign out of AutomationDM?' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Cancel' }).click();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/settings$/);

  await openSheet.click();
  await page
    .getByRole('dialog', { name: 'Sign out of AutomationDM?' })
    .getByRole('button', { name: 'Sign out', exact: true })
    .click();
  await expect(page).toHaveURL(/\/sign-in/);
});

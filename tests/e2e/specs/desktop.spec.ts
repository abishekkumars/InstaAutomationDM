import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

// The same seeded user on a desktop user agent: the desktop view, and the mobile-only routes
// sending it back to the dashboard - docs/ADR/0010-device-specific-views.md.

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test('a desktop browser gets the sidebar shell, not the tab bar', async ({ page }) => {
  await expect(page.locator('aside')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
  // Only a phone is offered the way back to the mobile site.
  await expect(page.getByRole('button', { name: 'Use mobile site' })).toHaveCount(0);
});

test('mobile-only routes redirect a desktop browser to the dashboard', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/settings');
  await expect(page).toHaveURL(/\/$/);
});

test('templates: create, edit, clone, set default and delete from the sidebar page', async ({
  page,
}) => {
  // Starts from no templates: global-setup.ts clears them, and every template test deletes its
  // last one before it ends.

  // Phase 19: Templates sits directly under Dashboard in the sidebar.
  const sidebarLinks = page.locator('aside nav a');
  await expect(sidebarLinks.nth(0)).toHaveText('Dashboard');
  await expect(sidebarLinks.nth(1)).toHaveText('Templates');
  await sidebarLinks.nth(1).click();
  await expect(page).toHaveURL(/\/templates$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Templates' })).toBeVisible();

  const row = (name: string) => page.locator('tbody tr').filter({ hasText: name });

  // First template: only a name is required, and it becomes the default.
  await page.getByRole('button', { name: '+ Create template' }).click();
  let editor = page.getByRole('dialog', { name: 'Create template' });
  await editor.getByLabel('Template name').fill('Giveaway entry');
  await editor.getByRole('tab', { name: 'Any comments' }).click();
  await editor.getByRole('button', { name: 'Save template' }).click();
  await expect(editor).toBeHidden();
  await expect(row('Giveaway entry')).toContainText('Default');
  await expect(row('Giveaway entry')).toContainText('Any comment');
  await expect(row('Giveaway entry')).toContainText('Not set, filled in per post');

  // Edit keeps the default and saves the new fields.
  await row('Giveaway entry').getByRole('button', { name: 'Edit' }).click();
  editor = page.getByRole('dialog', { name: 'Edit template' });
  await expect(editor.getByLabel('Template name')).toHaveValue('Giveaway entry');
  await editor.getByLabel('DM message').fill('You are in! Winners are announced on Friday.');
  await editor.getByRole('button', { name: 'Save changes' }).click();
  await expect(editor).toBeHidden();
  await expect(row('Giveaway entry')).toContainText('Winners are announced');
  await expect(row('Giveaway entry')).toContainText('Default');

  // Clone, then make the copy the default.
  await row('Giveaway entry').getByRole('button', { name: 'Clone' }).click();
  await expect(row('Copy of Giveaway entry')).toBeVisible();
  await expect(row('Copy of Giveaway entry')).not.toContainText('Default');
  await row('Copy of Giveaway entry').getByRole('button', { name: 'Set default' }).click();
  await expect(row('Copy of Giveaway entry')).toContainText('Default');
  // The default row has no "Set default" of its own - the tag moves, it is never removed.
  await expect(
    row('Copy of Giveaway entry').getByRole('button', { name: 'Set default' }),
  ).toHaveCount(0);
  // `exact`: a plain hasText filter is a case-insensitive substring match, so it would also count
  // the "Set default" button on every non-default row.
  await expect(
    page.locator('tbody tr').filter({ has: page.getByText('Default', { exact: true }) }),
  ).toHaveCount(1);

  // Deleting a non-default template leaves the default where it is.
  await row('Giveaway entry').first().getByRole('button', { name: 'Delete' }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete template' });
  await expect(confirm).not.toContainText('becomes the new default');
  await confirm.getByRole('button', { name: 'Delete template' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(row('Copy of Giveaway entry')).toContainText('Default');

  // Deleting the last one warns that nothing will be left, and ends where the next test starts.
  await row('Copy of Giveaway entry').getByRole('button', { name: 'Delete' }).click();
  await expect(confirm).toContainText('There will be no template left');
  await confirm.getByRole('button', { name: 'Delete template' }).click();
  await expect(page.getByRole('heading', { name: 'No templates yet' })).toBeVisible();
});

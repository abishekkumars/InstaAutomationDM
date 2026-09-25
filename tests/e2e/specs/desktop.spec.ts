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

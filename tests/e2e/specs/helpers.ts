import { expect, type Page } from '@playwright/test';
import { E2E_EMAIL, E2E_PASSWORD } from '../fixtures';

/** Signs in through the real sign-in form as the seeded E2E user and waits for the app shell. */
export async function signIn(page: Page): Promise<void> {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(E2E_EMAIL);
  // `exact`: the show/hide toggle's aria-label ("Show password") also matches "Password".
  await page.getByLabel('Password', { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  // Generous: the first sign-in of a run can wait on the dev server compiling the dashboard.
  await expect(page).toHaveURL(/\/$/, { timeout: 45_000 });
}

/** Scrolls the page's scroll area. In both shells that is an inner element, not the window. */
export async function scrollContent(page: Page, top: number): Promise<void> {
  await page.evaluate((y) => {
    const scroller = [...document.querySelectorAll<HTMLElement>('div')].find(
      (element) =>
        getComputedStyle(element).overflowY === 'auto' &&
        element.scrollHeight > element.clientHeight,
    );
    scroller?.scrollTo({ top: y });
  }, top);
}

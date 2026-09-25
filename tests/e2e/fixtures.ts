/** The local-only account the browser tests sign in as, and what global-setup.ts seeds for it.
 *
 * Not a secret: a throwaway user that exists only in a developer's localhost database, created
 * and overwritten by every run - the same footing as the fixed Postgres credentials in
 * .github/workflows/ci.yml. Override with E2E_EMAIL / E2E_PASSWORD if you want your own. */
export const E2E_EMAIL = process.env.E2E_EMAIL ?? 'e2e@automationdm.local';
export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? 'e2e-local-only-password';
export const E2E_ORG_NAME = 'E2E (test data)';
export const E2E_ORG_SLUG = 'e2e-test-data';
export const E2E_HANDLE = 'e2e.studio';

/** [name, keywords ([] = any comment), isActive] - enough rows to scroll on a phone, with a mix of
 * active and paused so the filter counts are meaningful. */
export const E2E_AUTOMATIONS: [string, string[], boolean][] = [
  ['Summer drop lookbook', ['link', 'lookbook'], true],
  ['Free guide: 5 reel hooks', ['guide'], true],
  ['Bridal package prices', ['price', 'cost'], true],
  ['Giveaway entry confirmation', [], true],
  ['October workshop waitlist', ['waitlist'], false],
  ['BTS preset pack', ['preset'], true],
  ['Studio tour booking', ['book'], false],
  ['Discount code for new followers', ['code'], true],
  ['Restock alert signup', ['restock'], true],
  ['Recipe card', ['recipe'], true],
  ['Podcast episode link', ['episode'], false],
  ['Menu and prices', ['menu'], true],
];

export const E2E_ACTIVE_COUNT = E2E_AUTOMATIONS.filter(([, , active]) => active).length;
export const E2E_PAUSED_COUNT = E2E_AUTOMATIONS.length - E2E_ACTIVE_COUNT;

import { z } from 'zod';

// Shape of the body apps/web's /instagram/callback page forwards to apps/api after Zernio
// redirects the browser back with `connected=instagram&profileId=X&accountId=Y&username=Z`
// (docs/ZERNIO-INTEGRATION.md's "Account connection" section). `username` is intentionally
// not required here - apps/api independently re-fetches it from Zernio rather than trusting
// the redirect query string for anything beyond which profile/account to look up.
export const instagramCallbackSchema = z.object({
  profileId: z.string().trim().min(1, 'profileId is required.'),
  accountId: z.string().trim().min(1, 'accountId is required.'),
});

export type InstagramCallbackInput = z.infer<typeof instagramCallbackSchema>;

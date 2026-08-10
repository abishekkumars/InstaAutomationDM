import { z } from 'zod';

// Enforced here, not at the database layer: the schema is this project's source of truth
// for password policy (docs/SECURITY.md, "all external input validated with Zod"), and this
// value is what apps/web's registration form and Auth.js's Credentials authorize() callback
// both import, so the two can never drift apart.
export const MIN_PASSWORD_LENGTH = 8;

export const credentialsSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'Email is required.')
    .email('Enter a valid email address.'),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`),
});

export type Credentials = z.infer<typeof credentialsSchema>;

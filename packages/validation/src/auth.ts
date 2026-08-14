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

/** Registration (Phase 15.4, requirement 2): the sign-in credentials plus a confirmation field.
 *
 * A separate schema rather than a flag on `credentialsSchema`, because the two are used at
 * genuinely different moments: signing in must never ask for a confirmation, and Auth.js's
 * `authorize()` callback parses the sign-in shape. Extending keeps the email/password rules
 * themselves in one place, so they cannot drift between the two forms.
 *
 * Note what is still absent: no `role` field, here or anywhere else on a creation path. That is
 * requirement 20, and the absence is the enforcement - see docs/SECURITY.md. */
export const registerSchema = credentialsSchema
  .extend({
    confirmPassword: z.string().min(1, 'Please confirm your password.'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    // Reported against the confirmation field, not the form as a whole, so the message lands
    // next to the input the user has to fix rather than floating above both.
    path: ['confirmPassword'],
    message: 'Those passwords do not match.',
  });

export type RegisterInput = z.infer<typeof registerSchema>;

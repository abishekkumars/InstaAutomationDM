import Link from 'next/link';
import { GoogleButton } from '../(auth)/google-button';
import { SignUpForm } from '../(auth)/sign-up-form';

export default function SignUpPage() {
  return (
    <div className="mx-auto max-w-sm space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">Create an account</h1>
        <p className="mt-1 text-sm text-text-muted">
          Already have an account?{' '}
          <Link href="/sign-in" className="font-medium text-text underline">
            Sign in
          </Link>
          .
        </p>
      </div>
      <SignUpForm />
      {/* Same action as on the sign-in page - Google's flow creates the account if it does not
          exist yet, so there is no separate "sign up with Google" path to build. */}
      <GoogleButton label="Sign up with Google" />
    </div>
  );
}

import Link from 'next/link';
import { SignInForm } from '../(auth)/sign-in-form';

export default function SignInPage() {
  return (
    <div className="mx-auto max-w-sm space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">Sign in</h1>
        <p className="mt-1 text-sm text-text-muted">
          Don&apos;t have an account?{' '}
          <Link href="/sign-up" className="font-medium text-text underline">
            Create one
          </Link>
          .
        </p>
      </div>
      <SignInForm />
    </div>
  );
}

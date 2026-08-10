import Link from 'next/link';
import { SignInForm } from '../(auth)/sign-in-form';

export default function SignInPage() {
  return (
    <div className="mx-auto max-w-sm space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-slate-600">
          Don&apos;t have an account?{' '}
          <Link href="/sign-up" className="font-medium text-slate-900 underline">
            Create one
          </Link>
          .
        </p>
      </div>
      <SignInForm />
    </div>
  );
}

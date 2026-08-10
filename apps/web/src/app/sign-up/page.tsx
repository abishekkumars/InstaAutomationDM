import Link from 'next/link';
import { SignUpForm } from '../(auth)/sign-up-form';

export default function SignUpPage() {
  return (
    <div className="mx-auto max-w-sm space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Create an account</h1>
        <p className="mt-1 text-sm text-slate-600">
          Already have an account?{' '}
          <Link href="/sign-in" className="font-medium text-slate-900 underline">
            Sign in
          </Link>
          .
        </p>
      </div>
      <SignUpForm />
    </div>
  );
}

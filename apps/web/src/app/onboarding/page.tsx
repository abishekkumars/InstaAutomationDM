import { CreateOrganizationForm } from './create-organization-form';

export default function OnboardingPage() {
  return (
    <div className="mx-auto max-w-sm space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">Create your organization</h1>
        <p className="mt-1 text-sm text-text-muted">
          You&apos;ll use this workspace to connect Instagram accounts and build automations.
        </p>
      </div>
      <CreateOrganizationForm />
    </div>
  );
}

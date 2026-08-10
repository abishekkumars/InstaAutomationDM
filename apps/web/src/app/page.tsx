const PLACEHOLDER_SECTIONS = ['Automations', 'Contacts', 'Analytics'];

export default function HomePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Dashboard</h1>
        <p className="mt-2 text-sm text-slate-600 sm:text-base">
          This is a placeholder home screen. Automations, contacts, inbox, and analytics land in
          later phases — see{' '}
          <code className="rounded bg-slate-100 px-1 py-0.5">docs/IMPLEMENTATION-ROADMAP.md</code>.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PLACEHOLDER_SECTIONS.map((label) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="font-medium">{label}</h2>
            <p className="mt-1 text-sm text-slate-500">Coming soon.</p>
          </div>
        ))}
      </div>
    </div>
  );
}

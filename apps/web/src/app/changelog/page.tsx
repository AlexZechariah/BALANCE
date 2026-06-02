import Link from 'next/link';

interface ChangelogEntry {
  type: 'feat' | 'fix';
  title: string;
  summary: string;
  date: string;
}

const COMMIT_TYPE_COLORS: Record<string, string> = {
  feat: 'border-primary/30 bg-primary/10 text-primary',
  fix: 'border-red-500/30 bg-red-500/10 text-red-500',
  docs: 'border-blue-500/30 bg-blue-500/10 text-blue-500',
  chore: 'border-muted bg-muted text-muted-foreground',
  refactor: 'border-purple-500/30 bg-purple-500/10 text-purple-500',
  build: 'border-orange-500/30 bg-orange-500/10 text-orange-500',
  ci: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-600',
  perf: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500',
};

const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    type: 'feat',
    title: 'Portable security and observability foundation',
    summary: 'Added hardened cookie sessions, server-side authorization, safer uploads, structured logging, security verification, and local observability services.',
    date: 'June 2026',
  },
  {
    type: 'feat',
    title: 'Provider-neutral document processing',
    summary: 'Added a local-first document pipeline with provider-neutral storage, open-source extraction, correction, claim, review, and audit workflows.',
    date: 'June 2026',
  },
  {
    type: 'fix',
    title: 'More reliable monthly budget tracking',
    summary: 'Improved monthly budget calculations and aligned budget status behavior across the application.',
    date: 'May 2026',
  },
];

function ChangeTypeBadge({ type }: { type: ChangelogEntry['type'] }) {
  const color = COMMIT_TYPE_COLORS[type] ?? 'border-muted bg-muted text-muted-foreground';
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${color}`}>
      {type}
    </span>
  );
}

export default function ChangelogPage() {
  return (
    <main className="min-h-screen bg-background text-foreground px-6 py-10">
      <div className="mx-auto max-w-2xl flex flex-col gap-8">
        <header>
          <Link href="/" className="text-xs text-muted-foreground hover:text-foreground transition">
            Back
          </Link>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">{"What's New"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Curated product updates from Balance.
          </p>
        </header>

        <div className="flex flex-col gap-3">
          {CHANGELOG_ENTRIES.map((entry) => (
            <div key={entry.title} className="rounded-2xl border border-border bg-muted/20 p-5">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <ChangeTypeBadge type={entry.type} />
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{entry.date}</span>
              </div>
              <p className="text-sm font-medium">{entry.title}</p>
              <p className="mt-2 text-xs text-muted-foreground">{entry.summary}</p>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Product updates are curated to avoid exposing private development metadata.
        </p>
      </div>
    </main>
  );
}

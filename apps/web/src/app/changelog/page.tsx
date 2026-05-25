'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      date: string;
    };
  };
}

interface CommitEntry {
  sha: string;
  shortSha: string;
  title: string;
  body: string | null;
  author: string;
  date: string;
}

function parseCommit(commit: GitHubCommit): CommitEntry {
  const lines = commit.commit.message.trim().split('\n');
  const title = lines[0] ?? '';
  const body = lines.slice(2).join('\n').trim() || null;
  return {
    sha: commit.sha,
    shortSha: commit.sha.slice(0, 7),
    title,
    body,
    author: commit.commit.author.name,
    date: new Date(commit.commit.author.date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
  };
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

function CommitTypeBadge({ title }: { title: string }) {
  const match = title.match(/^(\w+)(\(.+?\))?[!:]?/);
  const type = match?.[1]?.toLowerCase() ?? '';
  const scope = match?.[2]?.replace(/[()]/g, '') ?? null;
  const color = COMMIT_TYPE_COLORS[type] ?? 'border-muted bg-muted text-muted-foreground';
  if (!type) return null;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${color}`}>
      {scope ? `${type}(${scope})` : type}
    </span>
  );
}

function cleanTitle(title: string): string {
  return title.replace(/^\w+(\(.+?\))?[!]?:\s*/, '');
}

export default function ChangelogPage() {
  const [commits, setCommits] = useState<CommitEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/github/commits')
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `Failed to load commits: ${res.status}`);
        }
        return res.json() as Promise<GitHubCommit[]>;
      })
      .then((data) => {
        setCommits(data.map(parseCommit));
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load changelog.');
        setLoading(false);
      });
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground px-6 py-10">
      <div className="mx-auto max-w-2xl flex flex-col gap-8">
        <header>
          <Link href="/" className="text-xs text-muted-foreground hover:text-foreground transition">
            Back
          </Link>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">{"What's New"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Latest changes to Balance, pulled directly from GitHub.
          </p>
        </header>

        {loading && (
          <div className="flex flex-col gap-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="rounded-2xl border border-border bg-muted/30 p-5 animate-pulse">
                <div className="h-3 w-24 rounded bg-muted mb-3" />
                <div className="h-4 w-3/4 rounded bg-muted" />
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-5">
            <p className="text-sm text-red-500">{error}</p>
          </div>
        )}

        {!loading && !error && (
          <div className="flex flex-col gap-3">
            {commits.map((commit) => (
              <div key={commit.sha} className="rounded-2xl border border-border bg-muted/20 p-5">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CommitTypeBadge title={commit.title} />
                    <span className="font-mono text-xs text-muted-foreground">{commit.shortSha}</span>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{commit.date}</span>
                </div>
                <p className="text-sm font-medium">{cleanTitle(commit.title)}</p>
                {commit.body && (
                  <p className="mt-2 text-xs text-muted-foreground whitespace-pre-line">{commit.body}</p>
                )}
                <p className="mt-2 text-xs text-muted-foreground">{commit.author}</p>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center">
          Showing the last 20 commits on main
        </p>
      </div>
    </main>
  );
}

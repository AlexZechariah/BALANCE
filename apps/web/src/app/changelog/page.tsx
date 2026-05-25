'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string | null;
  published_at: string;
  html_url: string;
}

export default function ChangelogPage() {
  const [releases, setReleases] = useState<GitHubRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/github/releases')
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load releases: ${res.status}`);
        return res.json() as Promise<GitHubRelease[]>;
      })
      .then((releases) => {
        setReleases(releases);
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
            {releases.map((release) => (
              <div key={release.tag_name} className="rounded-2xl border border-border bg-muted/20 p-5">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <span className="font-mono text-xs text-muted-foreground">{release.tag_name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(release.published_at).toLocaleDateString('en-US', {
                      year: 'numeric', month: 'long', day: 'numeric',
                    })}
                  </span>
                </div>
                <p className="text-sm font-medium">{release.name}</p>
                {release.body && (
                  <div className="mt-2 text-xs text-muted-foreground whitespace-pre-line">{release.body}</div>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center">
          Showing the last 20 releases
        </p>
      </div>
    </main>
  );
}

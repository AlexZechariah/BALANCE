import Link from 'next/link';
import { loadAppConfig } from '@balance/config';

import { ApiStatusPanel } from './api-status-panel';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

interface RoutePlaceholderShellProps {
  routePath: '/' | '/login' | '/app';
  routeTitle: string;
  routeSummary: string;
}

const routeLinks: Array<{ href: '/' | '/login' | '/app'; label: string }> = [
  { href: '/', label: 'Home' },
  { href: '/login', label: 'Login' },
  { href: '/app', label: 'App' }
];

export function RoutePlaceholderShell({ routePath, routeTitle, routeSummary }: RoutePlaceholderShellProps) {
  const config = loadAppConfig();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto grid max-w-6xl gap-5 px-4 py-8 lg:px-6">
        <section className="rounded-lg border border-border bg-card p-6">
          <Badge variant="success">{config.appEnv.toUpperCase()}</Badge>
          <h1 className="mt-5 text-3xl font-semibold tracking-tight">{config.appName}</h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            Balance converts receipts, invoices, claims, reviews, and audit evidence into a structured document system.
          </p>
        </section>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader><CardTitle>Route</CardTitle></CardHeader>
            <CardContent>
              <p className="font-mono text-2xl font-semibold">{routePath}</p>
              <p className="mt-2 text-sm text-muted-foreground">{routeTitle}. {routeSummary}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Release</CardTitle></CardHeader>
            <CardContent>
              <p className="font-mono text-2xl font-semibold">{config.appVersion}</p>
              <p className="mt-2 text-sm text-muted-foreground">Commit {config.gitCommit} · Build {config.buildId}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>API</CardTitle></CardHeader>
            <CardContent>
              <p className="font-mono text-2xl font-semibold">{config.apiBasePath}/*</p>
              <p className="mt-2 text-sm text-muted-foreground">Proxy-safe health checks and internal API forwarding.</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Available Routes</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
          {routeLinks.map((item) => {
            const isActive = item.href === routePath;

            return (
              <Button
                key={item.href}
                asChild
                variant={isActive ? 'default' : 'secondary'}
                size="sm"
              >
                <Link href={item.href}>{item.label} · {item.href}</Link>
              </Button>
            );
          })}
            </div>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              The primary home route is now the Balance entry and role gateway. Diagnostic panels remain a secondary support surface.
            </p>
          </CardContent>
        </Card>

        <ApiStatusPanel healthPath={config.apiHealthPath} versionPath={config.apiVersionPath} />
      </div>
    </main>
  );
}

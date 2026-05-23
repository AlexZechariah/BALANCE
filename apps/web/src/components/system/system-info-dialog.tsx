'use client';

import { Dialog } from '../ui/dialog';
import { EnvironmentBadge } from './environment-badge';
import type { SystemStatus } from '../../hooks/use-system-status';

const statusDot: Record<string, string> = {
  operational: 'bg-emerald-500',
  degraded: 'bg-yellow-500',
  unavailable: 'bg-red-500',
  unknown: 'bg-muted-foreground',
};

const statusLabel: Record<string, string> = {
  operational: 'Operational',
  degraded: 'Degraded',
  unavailable: 'Unavailable',
  unknown: 'Unknown',
};

interface SystemInfoDialogProps {
  status: SystemStatus;
  onClose: () => void;
}

export function SystemInfoDialog({ status, onClose }: SystemInfoDialogProps) {
  const rows: Array<{ label: string; value: React.ReactNode }> = [
    { label: 'App', value: status.app },
    { label: 'Service', value: <span className="font-mono text-sm">{status.service}</span> },
    { label: 'Environment', value: <EnvironmentBadge environment={status.environment} size="sm" /> },
    { label: 'Version', value: <span className="font-mono text-sm">v{status.version}</span> },
    {
      label: 'Commit',
      value: (
        <span className="font-mono text-sm" title={status.commit}>
          {status.shortCommit}
          {status.commit !== status.shortCommit && (
            <span className="ml-2 text-muted-foreground text-xs">{status.commit}</span>
          )}
        </span>
      ),
    },
    { label: 'Build', value: <span className="font-mono text-sm">{status.build}</span> },
    {
      label: 'API health',
      value: (
        <span className={`font-mono text-sm ${status.healthStatus === 'ok' ? 'text-emerald-500' : 'text-red-500'}`}>
          {status.healthStatus}
        </span>
      ),
    },
    {
      label: 'API readiness',
      value: (
        <span className={`font-mono text-sm ${status.readyStatus === 'ready' ? 'text-emerald-500' : 'text-yellow-500'}`}>
          {status.readyStatus}
        </span>
      ),
    },
    {
      label: 'Last checked',
      value: <span className="text-sm">{status.lastCheckedAt ? new Date(status.lastCheckedAt).toLocaleString() : '—'}</span>,
    },
  ];

  return (
    <Dialog title="System Info" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-4 py-3">
          <span className={`h-2 w-2 rounded-full ${statusDot[status.overallStatus] ?? statusDot.unknown}`} />
          <span className="text-sm font-medium">
            {statusLabel[status.overallStatus] ?? 'Unknown'}
          </span>
          {status.isLoading && (
            <span className="ml-auto text-xs text-muted-foreground animate-pulse">Checking…</span>
          )}
          {!status.isLoading && (
            <button
              onClick={status.refresh}
              className="ml-auto text-xs text-muted-foreground hover:text-foreground transition"
            >
              Refresh
            </button>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            <div key={row.label} className="flex items-start justify-between gap-4 text-sm">
              <span className="text-muted-foreground w-28 shrink-0">{row.label}</span>
              <span className="text-right">{row.value}</span>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground border-t border-border pt-3">
          This information is read-only. Deployment controls are managed through GitHub Actions.
        </p>
      </div>
    </Dialog>
  );
}

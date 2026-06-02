'use client';

import { useSystemStatus } from '../../hooks/use-system-status';
import { EnvironmentBadge } from './environment-badge';

const overallStyles = {
  operational: { dot: 'bg-emerald-400', text: 'text-emerald-300', label: 'Operational' },
  degraded: { dot: 'bg-yellow-400', text: 'text-yellow-300', label: 'Degraded' },
  unavailable: { dot: 'bg-red-400', text: 'text-red-300', label: 'Unavailable' },
  unknown: { dot: 'bg-slate-500', text: 'text-slate-400', label: 'Unknown' },
};

export function DeploymentStatusCard() {
  const status = useSystemStatus();
  const style = overallStyles[status.overallStatus] ?? overallStyles.unknown;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Deployment Status</p>
        <button
          onClick={status.refresh}
          disabled={status.isLoading}
          className="text-xs text-slate-500 hover:text-slate-300 transition disabled:opacity-40"
        >
          {status.isLoading ? 'Checking…' : 'Refresh'}
        </button>
      </div>

      {/* Overall status */}
      <div className="flex items-center gap-2 mb-5">
        <span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} />
        <span className={`text-sm font-medium ${style.text}`}>{style.label}</span>
        {!status.isLoading && status.environment !== 'unknown' && (
          <EnvironmentBadge environment={status.environment} size="sm" />
        )}
      </div>

      {/* Metadata grid */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <div>
          <p className="text-xs text-slate-500 mb-0.5">API health</p>
          <p className={`font-mono text-xs ${status.healthStatus === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
            {status.healthStatus}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-0.5">API readiness</p>
          <p className={`font-mono text-xs ${status.readyStatus === 'ready' ? 'text-emerald-400' : 'text-yellow-400'}`}>
            {status.readyStatus}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-0.5">Version</p>
          <p className="font-mono text-xs text-slate-300">v{status.version}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-0.5">Commit</p>
          <p className="font-mono text-xs text-slate-300" title={status.commit}>{status.shortCommit}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-0.5">Build</p>
          <p className="font-mono text-xs text-slate-300 truncate">{status.build}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-0.5">Last checked</p>
          <p className="text-xs text-slate-400">
            {status.lastCheckedAt ? new Date(status.lastCheckedAt).toLocaleTimeString() : '-'}
          </p>
        </div>
      </div>

      <p className="mt-4 text-xs text-slate-600 border-t border-white/5 pt-3">
        Read-only. Deployment is managed through GitHub Actions.
      </p>
    </div>
  );
}

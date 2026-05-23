'use client';

import { useState } from 'react';
import { useSystemStatus } from '../../hooks/use-system-status';
import { EnvironmentBadge } from './environment-badge';
import { SystemInfoDialog } from './system-info-dialog';

export function AppFooter() {
  const status = useSystemStatus();
  const [showModal, setShowModal] = useState(false);

  const versionText = status.isLoading
    ? 'Loading\u2026'
    : status.error || status.version === '\u2014'
    ? 'version unavailable'
    : `v${status.version} \u00b7 ${status.shortCommit}`;

  return (
    <>
      <footer className="border-t border-border bg-background/80 px-6 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">Balance</span>
            {!status.isLoading && (
              <EnvironmentBadge environment={status.environment} size="sm" />
            )}
            <span className="text-xs text-muted-foreground font-mono">{versionText}</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowModal(true)}
              className="text-xs text-muted-foreground hover:text-foreground transition"
            >
              System info
            </button>
            <a
              href="/changelog"
              className="text-xs text-muted-foreground hover:text-foreground transition"
            >
              {"What's new"}
            </a>
          </div>
        </div>
      </footer>
      {showModal && (
        <SystemInfoDialog status={status} onClose={() => setShowModal(false)} />
      )}
    </>
  );
}

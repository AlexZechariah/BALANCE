'use client';

import { useCallback, useEffect, useState } from 'react';
import { getApiVersion, getApiHealth, getApiReady } from '../lib/api/system';

export type HealthStatus = 'ok' | 'unavailable' | 'unknown';
export type ReadyStatus = 'ready' | 'not_ready' | 'unknown';
export type OverallStatus = 'operational' | 'degraded' | 'unavailable' | 'unknown';

export interface SystemStatus {
  app: string;
  service: string;
  environment: string;
  version: string;
  commit: string;
  shortCommit: string;
  build: string;
  healthStatus: HealthStatus;
  readyStatus: ReadyStatus;
  overallStatus: OverallStatus;
  lastCheckedAt: string | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
}

function deriveOverallStatus(health: HealthStatus, ready: ReadyStatus): OverallStatus {
  if (health === 'unavailable') return 'unavailable';
  if (health === 'unknown') return 'unknown';
  if (health === 'ok' && ready === 'ready') return 'operational';
  if (health === 'ok' && ready === 'not_ready') return 'degraded';
  return 'unknown';
}

export function useSystemStatus(): SystemStatus {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState({
    app: 'Balance',
    service: 'balance-api',
    environment: 'unknown',
    version: '-',
    commit: '-',
    shortCommit: '-',
    build: '-',
    healthStatus: 'unknown' as HealthStatus,
    readyStatus: 'unknown' as ReadyStatus,
    overallStatus: 'unknown' as OverallStatus,
    lastCheckedAt: null as string | null,
  });

  const fetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [version, health, ready] = await Promise.all([
        getApiVersion(),
        getApiHealth(),
        getApiReady(),
      ]);

      const commit = version?.commit ?? '-';
      const shortCommit = commit !== '-' && commit.length >= 7 ? commit.slice(0, 7) : commit;
      const healthStatus: HealthStatus = health?.status === 'ok' ? 'ok' : health === null ? 'unavailable' : 'unknown';
      const readyStatus: ReadyStatus = ready?.status === 'ready' ? 'ready' : ready === null ? 'not_ready' : 'unknown';

      setData({
        app: version?.app ?? 'Balance',
        service: version?.service ?? 'balance-api',
        environment: version?.environment ?? 'unknown',
        version: version?.version ?? '-',
        commit,
        shortCommit,
        build: version?.build ?? '-',
        healthStatus,
        readyStatus,
        overallStatus: deriveOverallStatus(healthStatus, readyStatus),
        lastCheckedAt: new Date().toISOString(),
      });
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch system status'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void fetch(); }, [fetch]);

  return { ...data, isLoading, error, refresh: fetch };
}

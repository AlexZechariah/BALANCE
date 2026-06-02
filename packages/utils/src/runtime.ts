import type { AppEnvironment } from '@balance/types';

const allowedEnvironments = new Set<AppEnvironment>(['local', 'staging', 'production']);

export function normalizeEnvironment(value: string | undefined): AppEnvironment {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) {
    return 'local';
  }

  if (allowedEnvironments.has(normalized as AppEnvironment)) {
    return normalized as AppEnvironment;
  }

  throw new Error(`Unsupported application environment: ${value}`);
}

export function parsePort(value: string | undefined, fallback: number): number {
  if (!value?.trim()) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`"${value}" must be a valid TCP port`);
  }

  return parsed;
}

export function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

export function buildApiBaseUrl(value: string | undefined, port: number): string {
  return trimTrailingSlash(value?.trim() || `http://localhost:${port}`);
}

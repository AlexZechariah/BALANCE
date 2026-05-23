// Read-only system metadata fetcher.
// Calls /api/version, /api/health, /api/ready — never deployment controls.

export interface ApiVersionPayload {
  service: string;
  app: string;
  environment: string;
  version: string;
  commit: string;
  build: string;
}

export interface ApiHealthPayload {
  status: 'ok' | string;
  service: string;
  app: string;
  environment: string;
  version: string;
}

export interface ApiReadyPayload {
  status: 'ready' | string;
  service: string;
  app: string;
  environment: string;
  version: string;
}

async function safeFetch<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

export async function getApiVersion(): Promise<ApiVersionPayload | null> {
  return safeFetch<ApiVersionPayload>('/api/version');
}

export async function getApiHealth(): Promise<ApiHealthPayload | null> {
  return safeFetch<ApiHealthPayload>('/api/health');
}

export async function getApiReady(): Promise<ApiReadyPayload | null> {
  return safeFetch<ApiReadyPayload>('/api/ready');
}

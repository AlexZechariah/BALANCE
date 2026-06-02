// Desktop API client uses the configurable API base URL from the preload bridge.
// Never calls :3001 directly. Always goes through the public web origin + /api.

export interface ApiError {
  code: string;
  message: string;
  details: Array<{ path: string; message: string }>;
}

export class DesktopApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly error: ApiError,
  ) {
    super(error.message);
    this.name = 'DesktopApiError';
  }
}

const CSRF_HEADER = 'x-csrf-token';

let csrfTokenMemory: string | null = null;

export function setCsrfToken(token: string | null | undefined): void {
  csrfTokenMemory = token || null;
}

export function clearCsrfToken(): void {
  csrfTokenMemory = null;
}

async function getBaseUrl(): Promise<string> {
  return window.balanceDesktop.getApiBaseUrl();
}

async function parseError(res: Response): Promise<ApiError> {
  try {
    const body = await res.json();
    if (body?.error?.code) return body.error as ApiError;
  } catch { /* fall through */ }
  return { code: 'INTERNAL_ERROR', message: `HTTP ${res.status}`, details: [] };
}

export async function desktopRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const base = await getBaseUrl();
  const url = `${base}${path}`;
  const method = (options.method || 'GET').toUpperCase();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(csrfTokenMemory && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) ? { [CSRF_HEADER]: csrfTokenMemory } : {}),
  };

  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: { ...headers, ...(options.headers ?? {}) },
  });

  if (!res.ok) {
    const error = await parseError(res);
    throw new DesktopApiError(res.status, error);
  }

  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

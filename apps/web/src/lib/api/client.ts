// Centralized API client for the Balance web frontend.
// All API calls go through /api (same-origin proxy). Never call :3001 directly.

import { markClientRequestStart, recordApiClientRequest } from '../observability/client';

const API_BASE = '/api';
const CSRF_COOKIE = 'balance.csrf';
const CSRF_HEADER = 'x-csrf-token';

let csrfTokenMemory: string | null = null;

export interface ApiError {
  code: string;
  message: string;
  details: Array<{ path: string; message: string }>;
  requestId?: string;
}

export class BalanceApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly error: ApiError,
  ) {
    super(error.message);
    this.name = 'BalanceApiError';
  }
}

function readCookie(name: string): string | null {
  if (typeof window === 'undefined') return null;
  const match = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}

export function setCsrfToken(token: string): void {
  csrfTokenMemory = token;
}

export function clearCsrfToken(): void {
  csrfTokenMemory = null;
}

function csrfToken(): string | null {
  return csrfTokenMemory || readCookie(CSRF_COOKIE);
}

function isMutatingMethod(method: string | undefined): boolean {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes((method || 'GET').toUpperCase());
}

function buildHeaders(includeAuth: boolean, method: string | undefined, isMultipart = false): HeadersInit {
  const headers: Record<string, string> = {};
  if (!isMultipart) {
    headers['Content-Type'] = 'application/json';
  }
  if (includeAuth && isMutatingMethod(method)) {
    const token = csrfToken();
    if (token) headers[CSRF_HEADER] = token;
  }
  return headers;
}

async function parseErrorResponse(res: Response): Promise<ApiError> {
  try {
    const body = await res.json();
    if (body?.error?.code) return body.error as ApiError;
  } catch {
    // fall through
  }
  return {
    code: 'INTERNAL_ERROR',
    message: `Unexpected error (HTTP ${res.status})`,
    details: [],
  };
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const { auth = true, ...fetchOptions } = options;
  const url = `${API_BASE}${path}`;
  const method = fetchOptions.method ?? 'GET';
  const startedAtMs = markClientRequestStart();
  let statusCode: number | null = null;
  let outcome: 'ok' | 'error' = 'error';

  try {
    const res = await fetch(url, {
      ...fetchOptions,
      credentials: 'include',
      headers: {
        ...buildHeaders(auth, method),
        ...(fetchOptions.headers ?? {}),
      },
    });
    statusCode = res.status;

    if (!res.ok) {
      const error = await parseErrorResponse(res);
      throw new BalanceApiError(res.status, error);
    }

    if (res.status === 204) {
      outcome = 'ok';
      return undefined as T;
    }

    const data = await res.json() as T;
    outcome = 'ok';
    return data;
  } finally {
    recordApiClientRequest({ method, path, statusCode, startedAtMs, outcome });
  }
}

export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {};
  const token = csrfToken();
  if (token) headers[CSRF_HEADER] = token;
  const startedAtMs = markClientRequestStart();
  let statusCode: number | null = null;
  let outcome: 'ok' | 'error' = 'error';

  try {
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: formData,
    });
    statusCode = res.status;

    if (!res.ok) {
      const error = await parseErrorResponse(res);
      throw new BalanceApiError(res.status, error);
    }

    const data = await res.json() as T;
    outcome = 'ok';
    return data;
  } finally {
    recordApiClientRequest({ method: 'POST', path, statusCode, startedAtMs, outcome });
  }
}

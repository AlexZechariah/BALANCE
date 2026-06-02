import type { UserRole } from '@balance/types';
import { apiRequest, clearCsrfToken, setCsrfToken } from './client';

export interface AuthUser {
  id: string;
  email: string;
  emailVerifiedAt: string | null;
  role: UserRole;
  displayName: string;
  organizationId: string | null;
}

export interface AuthSessionSummary {
  id: string;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

export interface LoginResponse {
  user: AuthUser;
  csrfToken: string;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const data = await apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ email, password }),
  });
  setCsrfToken(data.csrfToken);
  return data;
}

export async function getCurrentUser(): Promise<AuthUser> {
  const data = await apiRequest<{ user: AuthUser; csrfToken?: string | null }>('/auth/me');
  if (data.csrfToken) setCsrfToken(data.csrfToken);
  return data.user;
}

export async function updateAccount(input: {
  displayName?: string | undefined;
  email?: string | undefined;
  currentPassword?: string | undefined;
  newPassword?: string | undefined;
}): Promise<{ user: AuthUser }> {
  return apiRequest<{ user: AuthUser }>('/auth/me', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export type AccountTokenRequestResponse = {
  ok: true;
  devToken?: string;
  expiresAt?: string | null;
};

export async function requestPasswordReset(email: string): Promise<AccountTokenRequestResponse> {
  return apiRequest<AccountTokenRequestResponse>('/auth/password-reset/request', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ email }),
  });
}

export async function confirmPasswordReset(token: string, password: string): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>('/auth/password-reset/confirm', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ token, password }),
  });
}

export async function requestEmailVerification(email: string): Promise<AccountTokenRequestResponse> {
  return apiRequest<AccountTokenRequestResponse>('/auth/email-verification/request', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ email }),
  });
}

export async function confirmEmailVerification(token: string): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>('/auth/email-verification/confirm', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ token }),
  });
}

export async function listSessions(): Promise<{ sessions: AuthSessionSummary[] }> {
  return apiRequest<{ sessions: AuthSessionSummary[] }>('/auth/sessions');
}

export async function revokeOtherSessions(): Promise<{ revokedCount: number }> {
  return apiRequest<{ revokedCount: number }>('/auth/sessions/revoke-others', {
    method: 'POST',
  });
}

export async function register(
  email: string,
  password: string,
  displayName: string,
  orgName?: string,
): Promise<LoginResponse> {
  const data = await apiRequest<LoginResponse>('/auth/register', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ email, password, displayName, orgName }),
  });
  setCsrfToken(data.csrfToken);
  return data;
}

export async function logout(): Promise<void> {
  try {
    await apiRequest<{ ok: boolean }>('/auth/logout', { method: 'POST' });
  } finally {
    clearCsrfToken();
  }
}

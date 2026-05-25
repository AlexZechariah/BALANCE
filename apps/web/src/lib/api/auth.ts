import type { UserRole } from '@balance/types';
import { apiRequest, clearToken, setToken } from './client';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  displayName: string;
  organizationId: string | null;
}

export interface LoginResponse {
  user: AuthUser;
  accessToken: string;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const data = await apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ email, password }),
  });
  setToken(data.accessToken);
  return data;
}

export async function getCurrentUser(): Promise<AuthUser> {
  const data = await apiRequest<{ user: AuthUser }>('/auth/me');
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
  setToken(data.accessToken);
  return data;
}

export async function logout(): Promise<void> {
  try {
    await apiRequest<{ ok: boolean }>('/auth/logout', { method: 'POST' });
  } finally {
    clearToken();
  }
}

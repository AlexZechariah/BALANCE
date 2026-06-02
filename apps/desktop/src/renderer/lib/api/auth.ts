import { clearCsrfToken, desktopRequest, setCsrfToken } from './client';

export interface DesktopUser {
  id: string;
  email: string;
  role: string;
  displayName: string;
}

interface DesktopAuthResponse {
  user: DesktopUser;
  csrfToken?: string | null;
}

export async function desktopLogin(email: string, password: string): Promise<DesktopUser> {
  const data = await desktopRequest<DesktopAuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setCsrfToken(data.csrfToken);
  return data.user;
}

export async function desktopGetCurrentUser(): Promise<DesktopUser> {
  const data = await desktopRequest<DesktopAuthResponse>('/auth/me');
  setCsrfToken(data.csrfToken);
  return data.user;
}

export async function desktopLogout(): Promise<void> {
  try {
    await desktopRequest('/auth/logout', { method: 'POST' });
  } finally {
    clearCsrfToken();
  }
}

'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { getCurrentUser, login as apiLogin, logout as apiLogout, register as apiRegister, updateAccount as apiUpdateAccount } from '../lib/api/auth';
import type { AuthUser } from '../lib/api/auth';

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (email: string, password: string, displayName: string, orgName?: string) => Promise<AuthUser>;
  updateAccount: (input: { displayName?: string | undefined; email?: string | undefined; currentPassword?: string | undefined; newPassword?: string | undefined }) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    getCurrentUser()
      .then((user) => setState({ user, loading: false, error: null }))
      .catch(() => {
        setState({ user: null, loading: false, error: null });
      });
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<AuthUser> => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await apiLogin(email, password);
      setState({ user: data.user, loading: false, error: null });
      return data.user;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      setState((s) => ({ ...s, loading: false, error: msg }));
      throw err;
    }
  }, []);

  const register = useCallback(async (
    email: string,
    password: string,
    displayName: string,
    orgName?: string,
  ): Promise<AuthUser> => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await apiRegister(email, password, displayName, orgName);
      setState({ user: data.user, loading: false, error: null });
      return data.user;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Registration failed';
      setState((s) => ({ ...s, loading: false, error: msg }));
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setState({ user: null, loading: false, error: null });
  }, []);

  const updateAccount = useCallback(async (input: { displayName?: string | undefined; email?: string | undefined; currentPassword?: string | undefined; newPassword?: string | undefined }) => {
    const data = await apiUpdateAccount(input);
    setState((s) => ({ ...s, user: data.user, error: null }));
    return data.user;
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, register, updateAccount, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

'use client';

import React, { Suspense } from 'react';
import { usePathname } from 'next/navigation';

import * as authApi from '@/lib/auth';
import type { CurrentUser } from '@/lib/auth';
import { AUTH_TOKEN_STORAGE_KEY } from '@/lib/api';

type AuthContextValue = {
  user: CurrentUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<CurrentUser>;
  logout: () => Promise<void>;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

const isPublicPath = (pathname: string | null) =>
  pathname === '/login' ||
  pathname === '/signin' ||
  pathname?.startsWith('/widget') === true;

function AuthProviderInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = React.useState<CurrentUser | null>(null);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    if (typeof window !== 'undefined') {
      if (isPublicPath(pathname)) {
        setUser(null);
        setLoading(false);
        return;
      }
      const token = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
      if (!token) {
        setUser(null);
        setLoading(false);
        return;
      }
    }

    try {
      const me = await authApi.me();
      setUser(me);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 401 && typeof window !== 'undefined') {
        window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
      }
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [pathname]);

  React.useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  const login = React.useCallback(async (email: string, password: string) => {
    const me = await authApi.login(email, password);
    setUser(me);
    return me;
  }, []);

  const logout = React.useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, refresh, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const loadingValue = React.useMemo<AuthContextValue>(
    () => ({
      user: null,
      loading: true,
      refresh: async () => {},
      login: async () => {
        throw new Error('Auth is still loading');
      },
      logout: async () => {},
    }),
    [],
  );

  return (
    <Suspense
      fallback={
        <AuthContext.Provider value={loadingValue}>{children}</AuthContext.Provider>
      }
    >
      <AuthProviderInner>{children}</AuthProviderInner>
    </Suspense>
  );
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

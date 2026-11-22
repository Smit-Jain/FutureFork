import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, setUnauthorizedHandler } from '../api/client';
import { User } from '../contracts/types';

interface AuthState {
  /** undefined while the session is being checked, null when signed out */
  user: User | null | undefined;
  refresh: () => Promise<User | null>;
  setUser: (u: User | null) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export const signInPath = (next: string) => `/signin?next=${encodeURIComponent(next)}`;

/** Loads the session once (/auth/me) and sends people to sign-in whenever the API answers 401. */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const navigate = useNavigate();
  const location = useLocation();

  const refresh = useCallback(async () => {
    try {
      const u = await api.me();
      setUser(u);
      return u;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Session expired mid-use: go to sign-in and come back to the same place afterwards
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      if (!window.location.pathname.startsWith('/signin')) {
        navigate(signInPath(window.location.pathname + window.location.search), { replace: true });
      }
    });
    return () => setUnauthorizedHandler(null);
  }, [navigate, location.key]);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
      navigate('/signin', { replace: true });
    }
  }, [navigate]);

  const value = useMemo(() => ({ user, refresh, setUser, signOut }), [user, refresh, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

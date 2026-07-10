import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { apiFetch, tokenStorage } from '../api/client';

export interface AuthUser {
  id: string;
  email: string;
  alias: string;
  role: 'user' | 'admin';
}

interface AuthResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, alias: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    restoreSession();
  }, []);

  async function restoreSession(): Promise<void> {
    const hasSession = await tokenStorage.hasSession();
    if (!hasSession) {
      setIsLoading(false);
      return;
    }
    try {
      const { user: me } = await apiFetch<{ user: AuthUser }>('/auth/me');
      setUser(me);
    } catch {
      await tokenStorage.clear();
    } finally {
      setIsLoading(false);
    }
  }

  async function login(email: string, password: string): Promise<void> {
    const body = await apiFetch<AuthResponse>('/auth/login', {
      method: 'POST',
      skipAuth: true,
      body: JSON.stringify({ email, password }),
    });
    await tokenStorage.save(body.accessToken, body.refreshToken);
    setUser(body.user);
  }

  async function register(email: string, password: string, alias: string): Promise<void> {
    const body = await apiFetch<AuthResponse>('/auth/register', {
      method: 'POST',
      skipAuth: true,
      body: JSON.stringify({ email, password, alias }),
    });
    await tokenStorage.save(body.accessToken, body.refreshToken);
    setUser(body.user);
  }

  async function logout(): Promise<void> {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      // si la llamada falla (p.ej. sin red) cerramos sesión igualmente en local
    }
    await tokenStorage.clear();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  }
  return ctx;
}

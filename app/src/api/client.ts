import { env } from '../config/env';
import { storage } from '../config/storage';

const ACCESS_TOKEN_KEY = 'peporra_access_token';
const REFRESH_TOKEN_KEY = 'peporra_refresh_token';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await storage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) return null;

  const res = await fetch(`${env.apiUrl}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return null;

  const body = (await res.json()) as { accessToken: string };
  await storage.setItem(ACCESS_TOKEN_KEY, body.accessToken);
  return body.accessToken;
}

interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
}

// Cliente HTTP compartido: adjunta el access token, y si el servidor devuelve 401
// intenta refrescarlo una vez y repite la petición — igual que hacíamos "a mano"
// en los tests del backend, pero automático para toda la app.
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { skipAuth, headers, ...rest } = options;

  async function doFetch(token: string | null): Promise<Response> {
    return fetch(`${env.apiUrl}${path}`, {
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    });
  }

  const initialToken = skipAuth ? null : await storage.getItem(ACCESS_TOKEN_KEY);
  let res = await doFetch(initialToken);

  if (res.status === 401 && !skipAuth) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await doFetch(newToken);
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(body.error ?? 'Error de red', res.status);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const tokenStorage = {
  async save(accessToken: string, refreshToken: string): Promise<void> {
    await storage.setItem(ACCESS_TOKEN_KEY, accessToken);
    await storage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  },
  async clear(): Promise<void> {
    await storage.removeItem(ACCESS_TOKEN_KEY);
    await storage.removeItem(REFRESH_TOKEN_KEY);
  },
  async hasSession(): Promise<boolean> {
    return (await storage.getItem(ACCESS_TOKEN_KEY)) !== null;
  },
};

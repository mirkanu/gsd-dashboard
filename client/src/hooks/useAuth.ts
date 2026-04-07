import { useState, useEffect, useCallback } from 'react';

interface AuthState {
  authenticated: boolean | null; // null = checking
  login: (password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
}

export function useAuth(): AuthState {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    // Probe a lightweight protected endpoint to check if cookie is valid.
    // /api/health is public; use /api/stats instead which requires auth.
    fetch('/api/stats', { method: 'GET' })
      .then(r => setAuthenticated(r.status !== 401))
      .catch(() => setAuthenticated(false));
  }, []);

  const login = useCallback(async (password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const body = await res.json();
    if (res.ok) {
      setAuthenticated(true);
      return { ok: true };
    }
    return { ok: false, error: body.error || 'Login failed' };
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setAuthenticated(false);
  }, []);

  return { authenticated, login, logout };
}

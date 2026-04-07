import { useState, useCallback, type FormEvent } from 'react';
import { Lock } from 'lucide-react';

interface LoginProps {
  onLogin: (password: string) => Promise<{ ok: boolean; error?: string }>;
}

export function Login({ onLogin }: LoginProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (loading) return;
      setError(null);
      setLoading(true);
      try {
        const result = await onLogin(password);
        if (!result.ok) {
          setError(result.error ?? 'Login failed');
        }
      } catch {
        setError('Network error — please try again');
      } finally {
        setLoading(false);
      }
    },
    [password, loading, onLogin]
  );

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo / branding */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center mb-4">
            <Lock className="w-6 h-6 text-violet-400" />
          </div>
          <h1 className="text-xl font-semibold text-gray-100">GSD Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Enter your password to continue</p>
        </div>

        {/* Login card */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-xl">
          <form onSubmit={handleSubmit} noValidate>
            <div className="mb-4">
              <label htmlFor="password" className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter dashboard password"
                disabled={loading}
                autoFocus
                autoComplete="current-password"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600
                  focus:outline-none focus:ring-2 focus:ring-violet-500/60 focus:border-violet-500/60
                  disabled:opacity-50 disabled:cursor-not-allowed
                  transition-colors"
              />
            </div>

            {error && (
              <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full bg-violet-600 hover:bg-violet-500 disabled:bg-violet-600/40 disabled:cursor-not-allowed
                text-white font-medium text-sm rounded-lg px-4 py-2.5
                flex items-center justify-center gap-2
                transition-colors active:scale-[0.98]"
            >
              {loading ? (
                <>
                  <svg
                    className="animate-spin w-4 h-4 text-white/70"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

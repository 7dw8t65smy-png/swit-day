import { useState } from 'react';
import { Loader2, LogIn, UserPlus, Server } from 'lucide-react';
import { useAuth } from '../lib/auth';

type Mode = 'login' | 'register';

export default function LoginScreen() {
  const login = useAuth((s) => s.login);
  const register = useAuth((s) => s.register);
  const savedUrl = useAuth((s) => s.serverUrl);

  const [mode, setMode] = useState<Mode>('login');
  const [serverUrl, setServerUrl] = useState(savedUrl);
  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = Boolean(serverUrl.trim() && handle.trim() && password.length >= 6 && !busy);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const err =
      mode === 'login'
        ? await login(serverUrl.trim(), handle.trim(), password)
        : await register(serverUrl.trim(), handle.trim(), displayName.trim(), password);
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-bg p-6">
      {/* Атмосферный фон: мягкое свечение акцента, не плоская заливка. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-60"
        style={{
          background:
            'radial-gradient(60% 50% at 50% 0%, color-mix(in oklab, var(--accent, #2563EB) 18%, transparent), transparent 70%)'
        }}
      />
      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-white shadow-lg">
            <span className="text-2xl font-black tracking-tight">S</span>
          </div>
          <h1 className="text-2xl font-bold text-ink">SWIT Day</h1>
          <p className="mt-1 text-sm text-muted">
            {mode === 'login' ? 'Вход в общее пространство' : 'Создание аккаунта'}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-border bg-surface p-6 shadow-xl"
        >
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
            Адрес сервера
          </label>
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-bg px-3">
            <Server size={15} className="shrink-0 text-muted" />
            <input
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="https://swit.example.com"
              spellCheck={false}
              autoCapitalize="none"
              className="w-full bg-transparent py-2.5 text-sm text-ink outline-none placeholder:text-muted/60"
            />
          </div>

          {mode === 'register' && (
            <>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
                Имя (отображается участникам)
              </label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Никита"
                className="mb-4 w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-ink outline-none focus:border-accent placeholder:text-muted/60"
              />
            </>
          )}

          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
            Имя пользователя
          </label>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="nikita"
            spellCheck={false}
            autoCapitalize="none"
            className="mb-4 w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-ink outline-none focus:border-accent placeholder:text-muted/60"
          />

          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
            Пароль
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="минимум 6 символов"
            className="mb-2 w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-ink outline-none focus:border-accent placeholder:text-muted/60"
          />

          {error && (
            <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <Loader2 size={16} className="animate-spin" />
            ) : mode === 'login' ? (
              <LogIn size={16} />
            ) : (
              <UserPlus size={16} />
            )}
            {mode === 'login' ? 'Войти' : 'Создать аккаунт'}
          </button>

          <button
            type="button"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError(null);
            }}
            className="mt-4 w-full text-center text-sm text-muted transition hover:text-ink"
          >
            {mode === 'login' ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-muted/70">
          Личное пространство приватно. Командное — общее с теми, кого пригласите.
        </p>
      </div>
    </div>
  );
}

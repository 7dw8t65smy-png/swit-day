import { useState } from 'react';
import { Loader2, ArrowRight, User as UserIcon, Lock, Server, Sparkles } from 'lucide-react';
import { useAuth } from '../lib/auth';

type Mode = 'login' | 'register';

export default function LoginScreen() {
  const login = useAuth((s) => s.login);
  const register = useAuth((s) => s.register);
  const savedUrl = useAuth((s) => s.serverUrl);

  const [mode, setMode] = useState<Mode>('login');
  const [serverUrl, setServerUrl] = useState(savedUrl);
  const [showServer, setShowServer] = useState(false);
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

  const isLogin = mode === 'login';

  return (
    <div className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-bg p-6">
      {/* Атмосфера: два мягких пятна акцента + лёгкая сетка-зерно. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(48% 38% at 50% -8%, color-mix(in oklab, var(--color-accent) 26%, transparent), transparent 70%),' +
            'radial-gradient(40% 36% at 88% 108%, color-mix(in oklab, var(--color-accent) 16%, transparent), transparent 70%)'
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            'radial-gradient(currentColor 1px, transparent 1px), radial-gradient(currentColor 1px, transparent 1px)',
          backgroundSize: '22px 22px',
          backgroundPosition: '0 0, 11px 11px',
          color: 'var(--color-text)'
        }}
      />

      <div className="relative w-full max-w-[400px]">
        {/* Шапка */}
        <div className="mb-9 flex flex-col items-center text-center">
          <div
            className="mb-5 flex h-16 w-16 items-center justify-center rounded-[20px] text-white shadow-2xl"
            style={{
              background: 'linear-gradient(150deg, var(--color-accent), color-mix(in oklab, var(--color-accent) 70%, #000))',
              boxShadow: '0 18px 40px -16px var(--color-accent)'
            }}
          >
            <span className="text-[28px] font-black leading-none tracking-tight">S</span>
          </div>
          <h1 className="text-[26px] font-bold tracking-tight text-ink">SWIT Day</h1>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted">
            <Sparkles size={13} className="text-accent" />
            {isLogin ? 'С возвращением' : 'Создайте аккаунт'}
          </p>
        </div>

        {/* Сегментированный переключатель Вход / Регистрация */}
        <div className="mb-5 flex rounded-xl border border-border bg-surface p-1">
          {(['login', 'register'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
                mode === m ? 'bg-accent text-white shadow' : 'text-muted hover:text-ink'
              }`}
            >
              {m === 'login' ? 'Вход' : 'Регистрация'}
            </button>
          ))}
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-border bg-surface/80 p-6 shadow-2xl backdrop-blur-xl"
        >
          {mode === 'register' && (
            <Field label="Имя">
              <Input
                icon={<Sparkles size={15} />}
                value={displayName}
                onChange={setDisplayName}
                placeholder="Как вас зовут"
              />
            </Field>
          )}

          <Field label="Имя пользователя">
            <Input
              icon={<UserIcon size={15} />}
              value={handle}
              onChange={setHandle}
              placeholder="nikita"
              mono
            />
          </Field>

          <Field label="Пароль">
            <Input
              icon={<Lock size={15} />}
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="минимум 6 символов"
            />
          </Field>

          {showServer && (
            <Field label="Адрес сервера">
              <Input
                icon={<Server size={15} />}
                value={serverUrl}
                onChange={setServerUrl}
                placeholder="https://server.example.com"
                mono
              />
            </Field>
          )}

          {error && (
            <p className="mb-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="group mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <>
                {isLogin ? 'Войти' : 'Создать аккаунт'}
                <ArrowRight
                  size={16}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </>
            )}
          </button>
        </form>

        <div className="mt-5 flex items-center justify-center gap-3 text-xs text-muted">
          <button
            type="button"
            onClick={() => setShowServer((v) => !v)}
            className="transition hover:text-ink"
          >
            {showServer ? 'Скрыть адрес сервера' : 'Другой сервер'}
          </button>
        </div>

        <p className="mt-6 text-center text-xs leading-relaxed text-muted/70">
          Личное пространство приватно.
          <br />
          Командное — общее с теми, кого пригласите.
        </p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

function Input({
  icon,
  value,
  onChange,
  placeholder,
  type = 'text',
  mono
}: {
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border bg-bg px-3 transition focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
      <span className="shrink-0 text-muted">{icon}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        autoCapitalize="none"
        className={`w-full bg-transparent py-2.5 text-sm text-ink outline-none placeholder:text-muted/50 ${
          mono ? 'font-mono' : ''
        }`}
      />
    </div>
  );
}

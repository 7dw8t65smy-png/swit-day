import { useEffect, useState } from 'react';
import { Sun, Moon, Monitor, Sparkles, ArrowRight, Check } from 'lucide-react';
import { useSettings, type AppSettings } from '../lib/settings';

// Мастер первого запуска. Показывается, когда settings.onboarded === false.
// Собирает имя, время начала дня и тему, затем сохраняет всё на сервер тем же
// механизмом, что и страница настроек (store.update -> store.save), и ставит
// onboarded=true. «Пропустить» просто помечает onboarded=true без правок.
//
// Никакого собственного состояния настроек не держим — пишем сразу в store,
// чтобы тема применялась мгновенно (update() имеет визуальный side-effect).

const STEP_COUNT = 4; // welcome + name + day_start + theme

const THEMES: { v: AppSettings['theme']; label: string; Icon: typeof Sun }[] = [
  { v: 'light', label: 'Светлая', Icon: Sun },
  { v: 'dark', label: 'Тёмная', Icon: Moon },
  { v: 'system', label: 'Системная', Icon: Monitor }
];

export default function Onboarding(): JSX.Element | null {
  const onboarded = useSettings((s) => s.settings.onboarded);
  const loaded = useSettings((s) => s.loaded);
  const userName = useSettings((s) => s.settings.user_name);
  const dayStart = useSettings((s) => s.settings.day_start);
  const theme = useSettings((s) => s.settings.theme);
  const update = useSettings((s) => s.update);
  const save = useSettings((s) => s.save);

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  const isLast = step === STEP_COUNT - 1;

  async function finish(): Promise<void> {
    if (busy) return;
    setBusy(true);
    update('onboarded', true);
    try {
      await save();
    } catch {
      // Сервер недоступен — оставляем onboarded в памяти, не зацикливаем мастер.
    }
  }

  async function skip(): Promise<void> {
    if (busy) return;
    setBusy(true);
    update('onboarded', true);
    try {
      await save();
    } catch {
      // см. finish()
    }
  }

  function next(): void {
    if (isLast) {
      void finish();
      return;
    }
    setStep((s) => Math.min(s + 1, STEP_COUNT - 1));
  }

  function back(): void {
    setStep((s) => Math.max(s - 1, 0));
  }

  // Enter — вперёд/завершить, Esc — пропустить. Не перехватываем, когда мастер скрыт.
  useEffect(() => {
    if (loaded && onboarded) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Enter') {
        e.preventDefault();
        next();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        void skip();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, onboarded, step, busy]);

  // Не мигаем мастером до того, как настройки реально загрузились с сервера.
  if (!loaded || onboarded) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-bg/80 backdrop-blur-sm animate-fade-in">
      <div className="w-[480px] max-w-[92vw] bg-surface rounded-xl shadow-lg border border-border overflow-hidden animate-pop-in">
        {/* Акцентная шапка-полоса для глубины и иерархии */}
        <div className="h-1 bg-accent" />

        <div className="px-8 pt-8 pb-6 min-h-[260px] flex flex-col">
          {step === 0 && <WelcomeStep />}
          {step === 1 && (
            <NameStep value={userName} onChange={(v) => update('user_name', v)} onEnter={next} />
          )}
          {step === 2 && (
            <DayStartStep value={dayStart} onChange={(v) => update('day_start', v)} />
          )}
          {step === 3 && <ThemeStep value={theme} onChange={(v) => update('theme', v)} />}
        </div>

        {/* Прогресс + навигация */}
        <div className="flex items-center justify-between px-8 py-4 border-t border-border bg-surface2">
          <div className="flex items-center gap-1.5">
            {Array.from({ length: STEP_COUNT }).map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === step ? 'w-5 bg-accent' : 'w-1.5 bg-border'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {step === 0 ? (
              <button
                onClick={() => void skip()}
                disabled={busy}
                className="text-sm text-muted hover:text-ink transition-colors px-2 py-2 disabled:opacity-50"
              >
                Пропустить
              </button>
            ) : (
              <button
                onClick={back}
                disabled={busy}
                className="text-sm text-muted hover:text-ink transition-colors px-2 py-2 disabled:opacity-50"
              >
                Назад
              </button>
            )}
            <button
              onClick={next}
              disabled={busy}
              className="inline-flex items-center gap-1.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium px-4 py-2 rounded-md transition-colors active:scale-[0.98] disabled:opacity-60"
            >
              {isLast ? (
                <>
                  Готово <Check size={15} />
                </>
              ) : (
                <>
                  Далее <ArrowRight size={15} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ Steps ============

function WelcomeStep(): JSX.Element {
  return (
    <div className="flex flex-col items-center text-center my-auto">
      <span className="flex items-center justify-center w-14 h-14 rounded-xl bg-accent-light text-accent mb-5">
        <Sparkles size={26} />
      </span>
      <h1 className="text-2xl font-semibold tracking-tight">Добро пожаловать в SWIT Day</h1>
      <p className="text-sm text-muted mt-2.5 max-w-[320px] leading-relaxed">
        Планировщик дня, задачи, привычки и фокус в одном окне. Пара шагов — и всё под вас.
      </p>
    </div>
  );
}

function StepHeader({ title, hint }: { title: string; hint: string }): JSX.Element {
  return (
    <header className="mb-5">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="text-sm text-muted mt-1">{hint}</p>
    </header>
  );
}

function NameStep({
  value,
  onChange,
  onEnter
}: {
  value: string;
  onChange: (v: string) => void;
  onEnter: () => void;
}): JSX.Element {
  return (
    <div className="my-auto">
      <StepHeader title="Как к вам обращаться?" hint="Имя — в приветствиях и сводках дня." />
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // Enter здесь уже обрабатывает глобальный listener; гасим, чтобы форма не сабмитилась дважды.
          if (e.key === 'Enter') {
            e.stopPropagation();
            onEnter();
          }
        }}
        placeholder="Никита"
        className="input"
      />
    </div>
  );
}

function DayStartStep({
  value,
  onChange
}: {
  value: string;
  onChange: (v: string) => void;
}): JSX.Element {
  return (
    <div className="my-auto">
      <StepHeader
        title="Во сколько начинается день?"
        hint="Используется в напоминаниях и статистике."
      />
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input w-40"
      />
    </div>
  );
}

function ThemeStep({
  value,
  onChange
}: {
  value: AppSettings['theme'];
  onChange: (v: AppSettings['theme']) => void;
}): JSX.Element {
  return (
    <div className="my-auto">
      <StepHeader title="Выберите тему" hint="Можно сменить в любой момент в настройках." />
      <div className="grid grid-cols-3 gap-2">
        {THEMES.map((t) => (
          <button
            key={t.v}
            onClick={() => onChange(t.v)}
            className={`flex flex-col items-center gap-2 py-4 rounded-md border transition active:scale-[0.98] ${
              value === t.v
                ? 'border-accent bg-accent-light text-accent'
                : 'border-border hover:bg-surface2'
            }`}
          >
            <t.Icon size={18} />
            <span className="text-sm">{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

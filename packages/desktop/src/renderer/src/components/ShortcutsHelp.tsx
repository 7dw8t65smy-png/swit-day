import { useEffect } from 'react';
import { X, Keyboard } from 'lucide-react';
import { useShortcutsHelp } from '../hooks/useShortcutsHelp';

// Оверлей «Горячие клавиши» — открывается по `?` (Shift+/), закрывается Esc/клик вне.
// Чисто презентационный список; состояние живёт в useShortcutsHelp.

const MOD = '⌘'; // на macOS показываем Cmd; Ctrl работает идентично

type Shortcut = { keys: string[]; label: string };
type Group = { title: string; items: Shortcut[] };

const GROUPS: Group[] = [
  {
    title: 'Навигация',
    items: [
      { keys: [MOD, '1'], label: 'Сегодня' },
      { keys: [MOD, '2'], label: 'Задачи' },
      { keys: [MOD, '3'], label: 'Привычки' },
      { keys: [MOD, '4'], label: 'Заметки' },
      { keys: [MOD, '5'], label: 'Календарь' },
      { keys: [MOD, '6'], label: 'Плейбуки' },
      { keys: [MOD, '7'], label: 'Дневник' },
      { keys: [MOD, '8'], label: 'Статистика' }
    ]
  },
  {
    title: 'Действия',
    items: [
      { keys: [MOD, 'K'], label: 'Командная палитра' },
      { keys: [MOD, 'N'], label: 'Новая задача' },
      { keys: [MOD, ','], label: 'Настройки' },
      { keys: ['?'], label: 'Эта подсказка' }
    ]
  }
];

function Kbd({ children }: { children: string }): JSX.Element {
  return <kbd className="kbd">{children}</kbd>;
}

function ShortcutRow({ keys, label }: Shortcut): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-sm text-ink">{label}</span>
      <span className="flex items-center gap-1">
        {keys.map((k, i) => (
          <Kbd key={i}>{k}</Kbd>
        ))}
      </span>
    </div>
  );
}

export default function ShortcutsHelp(): JSX.Element | null {
  const isOpen = useShortcutsHelp((s) => s.isOpen);
  const close = useShortcutsHelp((s) => s.close);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, close]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 animate-fade-in"
      onClick={close}
    >
      <div
        className="w-[520px] max-w-[92vw] max-h-[85vh] overflow-y-auto bg-surface rounded-xl shadow-lg border border-border animate-pop-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Горячие клавиши"
      >
        <header className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <Keyboard size={18} className="text-accent" />
            <h2 className="font-semibold text-base">Горячие клавиши</h2>
          </div>
          <button
            onClick={close}
            aria-label="Закрыть"
            className="text-muted hover:text-ink transition-colors rounded-md p-1 hover:bg-surface2 active:scale-95"
          >
            <X size={18} />
          </button>
        </header>

        <div className="px-6 py-5 grid grid-cols-2 gap-x-8 gap-y-6">
          {GROUPS.map((g) => (
            <section key={g.title}>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-faint mb-1.5">
                {g.title}
              </h3>
              <div className="divide-y divide-border/60">
                {g.items.map((it) => (
                  <ShortcutRow key={it.label} keys={it.keys} label={it.label} />
                ))}
              </div>
            </section>
          ))}
        </div>

        <footer className="px-6 py-3 border-t border-border bg-surface2 rounded-b-xl">
          <p className="text-[11px] text-muted">
            На Windows/Linux вместо <Kbd>⌘</Kbd> используйте <Kbd>Ctrl</Kbd>.
          </p>
        </footer>
      </div>
    </div>
  );
}

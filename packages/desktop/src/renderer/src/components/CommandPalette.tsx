import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode
} from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Sun,
  ListTodo,
  StickyNote,
  Calendar as CalIcon,
  BookOpen,
  BarChart3,
  Settings as Gear,
  ListChecks,
  Flame,
  Wallet,
  FolderKanban,
  Search,
  CornerDownLeft,
  Loader2,
  type LucideProps
} from 'lucide-react';
import { api } from '../api';
import { useCommandPalette } from '../hooks/useCommandPalette';
import type { Habit, Note, Playbook, Project, Task } from '@swit/shared';

type IconType = ComponentType<LucideProps>;

/** Один результат палитры — переход или сущность. */
interface PaletteItem {
  id: string;
  /** К какой секции относится (заголовок группы). */
  group: string;
  icon: IconType;
  label: string;
  /** Второстепенный приглушённый контекст (проект, дедлайн и т.п.). */
  hint?: string;
  /** Маршрут, на который ведёт активация. */
  to: string;
  /** Текст для поиска (label + hint + доп. поля), уже в нижнем регистре. */
  search: string;
}

/**
 * Навигационные команды — зеркалят маршруты/иконки сайдбара
 * плюс пара алиасов (Проекты → /tasks, Настройки → /settings).
 */
const NAV_COMMANDS: Omit<PaletteItem, 'search'>[] = [
  { id: 'nav-today', group: 'Переход', icon: Sun, label: 'Сегодня', to: '/today' },
  { id: 'nav-tasks', group: 'Переход', icon: ListTodo, label: 'Задачи', to: '/tasks' },
  { id: 'nav-habits', group: 'Переход', icon: Flame, label: 'Рутины', to: '/habits' },
  { id: 'nav-notes', group: 'Переход', icon: StickyNote, label: 'Заметки', to: '/notes' },
  { id: 'nav-calendar', group: 'Переход', icon: CalIcon, label: 'Календарь', to: '/calendar' },
  { id: 'nav-journal', group: 'Переход', icon: BookOpen, label: 'Журнал', to: '/journal' },
  { id: 'nav-stats', group: 'Переход', icon: BarChart3, label: 'Статистика', to: '/stats' },
  { id: 'nav-projects', group: 'Переход', icon: FolderKanban, label: 'Проекты', to: '/tasks' },
  { id: 'nav-playbooks', group: 'Переход', icon: ListChecks, label: 'Регламенты', to: '/playbooks' },
  { id: 'nav-finance', group: 'Переход', icon: Wallet, label: 'Расходы', to: '/finance' },
  { id: 'nav-settings', group: 'Переход', icon: Gear, label: 'Настройки', to: '/settings' }
];

/** Порядок групп в выпадающем списке. */
const GROUP_ORDER = ['Переход', 'Задачи', 'Заметки', 'Проекты', 'Регламенты', 'Рутины'];

const MAX_PER_GROUP = 6;

/** Russian-aware substring match: оба в нижнем регистре. */
function matches(haystack: string, needle: string): boolean {
  return haystack.includes(needle);
}

function noteSnippet(content: string): string {
  const oneLine = content.replace(/\s+/g, ' ').trim();
  return oneLine.length > 60 ? `${oneLine.slice(0, 60)}…` : oneLine;
}

interface EntityData {
  tasks: Task[];
  projects: Project[];
  notes: Note[];
  playbooks: Playbook[];
  habits: Habit[];
}

const EMPTY_DATA: EntityData = {
  tasks: [],
  projects: [],
  notes: [],
  playbooks: [],
  habits: []
};

export default function CommandPalette(): ReactNode {
  const isOpen = useCommandPalette((s) => s.isOpen);
  const close = useCommandPalette((s) => s.close);
  const nav = useNavigate();

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [data, setData] = useState<EntityData>(EMPTY_DATA);
  const [loading, setLoading] = useState(false);
  const loadedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Ленивая загрузка сущностей при первом открытии. Personal-scale data —
  // фильтруем на клиенте, грузим один раз и кэшируем в state.
  useEffect(() => {
    if (!isOpen || loadedRef.current) return;
    loadedRef.current = true;
    setLoading(true);
    let cancelled = false;
    Promise.all([
      api.listTasks({ top_level: 'true' }),
      api.listProjects(),
      api.listNotes(),
      api.listPlaybooks(),
      api.listHabits()
    ])
      .then(([tasks, projects, notes, playbooks, habits]) => {
        if (cancelled) return;
        setData({ tasks, projects, notes, playbooks, habits });
      })
      .catch(() => {
        // Бэкенд может быть ещё не готов — оставляем переходы рабочими,
        // следующее открытие повторит загрузку.
        if (!cancelled) loadedRef.current = false;
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Сброс запроса/выделения и автофокус инпута при каждом открытии.
  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setSelected(0);
    const id = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [isOpen]);

  const projectNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of data.projects) map.set(p.id, p.name);
    return map;
  }, [data.projects]);

  // Полный набор кандидатов (переходы + сущности) с предвычисленным search-полем.
  const allItems = useMemo<PaletteItem[]>(() => {
    const navItems: PaletteItem[] = NAV_COMMANDS.map((c) => ({
      ...c,
      search: c.label.toLowerCase()
    }));

    const taskItems: PaletteItem[] = data.tasks.map((t) => {
      const project = t.project_id ? projectNameById.get(t.project_id) : undefined;
      const hint = [project, t.due_date].filter(Boolean).join(' · ') || undefined;
      return {
        id: `task-${t.id}`,
        group: 'Задачи',
        icon: ListTodo,
        label: t.title,
        hint,
        to: '/tasks',
        search: `${t.title} ${hint ?? ''}`.toLowerCase()
      };
    });

    const noteItems: PaletteItem[] = data.notes.map((n) => {
      const snippet = noteSnippet(n.content);
      const project = n.project_id ? projectNameById.get(n.project_id) : undefined;
      return {
        id: `note-${n.id}`,
        group: 'Заметки',
        icon: StickyNote,
        label: snippet || 'Без текста',
        hint: project,
        to: '/notes',
        search: `${n.content} ${project ?? ''}`.toLowerCase()
      };
    });

    const projectItems: PaletteItem[] = data.projects.map((p) => ({
      id: `project-${p.id}`,
      group: 'Проекты',
      icon: FolderKanban,
      label: p.name,
      hint: p.description ?? undefined,
      to: '/tasks',
      search: `${p.name} ${p.description ?? ''}`.toLowerCase()
    }));

    const playbookItems: PaletteItem[] = data.playbooks.map((p) => ({
      id: `playbook-${p.id}`,
      group: 'Регламенты',
      icon: ListChecks,
      label: p.title,
      hint: p.description ?? undefined,
      to: '/playbooks',
      search: `${p.title} ${p.description ?? ''}`.toLowerCase()
    }));

    const habitItems: PaletteItem[] = data.habits.map((h) => ({
      id: `habit-${h.id}`,
      group: 'Рутины',
      icon: Flame,
      label: h.title,
      hint: h.description ?? undefined,
      to: '/habits',
      search: `${h.title} ${h.description ?? ''}`.toLowerCase()
    }));

    return [
      ...navItems,
      ...taskItems,
      ...noteItems,
      ...projectItems,
      ...playbookItems,
      ...habitItems
    ];
  }, [data, projectNameById]);

  // Плоский отфильтрованный список (для клавиатурной навигации) и
  // сгруппированное представление (для рендера секций) выводятся из одного источника.
  const flatItems = useMemo<PaletteItem[]>(() => {
    const q = query.trim().toLowerCase();

    if (!q) {
      // Пустой запрос → только навигационные команды.
      return allItems.filter((i) => i.group === 'Переход');
    }

    const matched = allItems.filter((i) => matches(i.search, q));

    // Ограничиваем число результатов на группу, сохраняя порядок групп.
    const perGroup = new Map<string, number>();
    const limited: PaletteItem[] = [];
    for (const group of GROUP_ORDER) {
      for (const item of matched) {
        if (item.group !== group) continue;
        const count = perGroup.get(group) ?? 0;
        if (count >= MAX_PER_GROUP) continue;
        perGroup.set(group, count + 1);
        limited.push(item);
      }
    }
    return limited;
  }, [allItems, query]);

  const groups = useMemo(() => {
    const byGroup = new Map<string, PaletteItem[]>();
    for (const item of flatItems) {
      const arr = byGroup.get(item.group);
      if (arr) arr.push(item);
      else byGroup.set(item.group, [item]);
    }
    return GROUP_ORDER.filter((g) => byGroup.has(g)).map((g) => ({
      group: g,
      items: byGroup.get(g) as PaletteItem[]
    }));
  }, [flatItems]);

  // Держим выделение в пределах списка при изменении фильтра.
  useEffect(() => {
    setSelected((prev) => {
      if (flatItems.length === 0) return 0;
      return Math.min(prev, flatItems.length - 1);
    });
  }, [flatItems.length]);

  // Прокручиваем выделенную строку в зону видимости.
  useEffect(() => {
    if (!isOpen) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${selected}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selected, isOpen]);

  if (!isOpen) return null;

  const activate = (item: PaletteItem | undefined): void => {
    if (!item) return;
    close();
    nav(item.to);
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (flatItems.length === 0) return;
      setSelected((p) => (p + 1) % flatItems.length);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (flatItems.length === 0) return;
      setSelected((p) => (p - 1 + flatItems.length) % flatItems.length);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      activate(flatItems[selected]);
    }
  };

  const hasQuery = query.trim().length > 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 px-4 pt-[12vh] animate-fade-in"
      onMouseDown={close}
      aria-hidden={false}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Командная палитра"
        className="w-full max-w-[620px] overflow-hidden rounded-lg border border-border bg-surface shadow-lg"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search size={18} className="shrink-0 text-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            type="text"
            role="combobox"
            aria-expanded
            aria-controls="command-palette-list"
            aria-label="Поиск по приложению"
            aria-activedescendant={flatItems[selected] ? `cmd-${flatItems[selected].id}` : undefined}
            placeholder="Поиск или переход…"
            spellCheck={false}
            autoComplete="off"
            className="h-14 flex-1 bg-transparent text-[15px] text-ink placeholder:text-faint focus:outline-none"
          />
          {loading && <Loader2 size={16} className="shrink-0 animate-spin text-faint" />}
        </div>

        {/* Results */}
        <div
          ref={listRef}
          id="command-palette-list"
          role="listbox"
          aria-label="Результаты"
          className="max-h-[52vh] overflow-y-auto px-2 py-2"
        >
          {flatItems.length === 0 ? (
            <div className="px-3 py-10 text-center text-sm text-muted">
              {loading ? 'Загрузка…' : 'Ничего не найдено'}
            </div>
          ) : (
            groups.map(({ group, items }) => (
              <div key={group} className="mb-1 last:mb-0">
                <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-faint">
                  {group}
                </div>
                {items.map((item) => {
                  const index = flatItems.indexOf(item);
                  const isActive = index === selected;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      id={`cmd-${item.id}`}
                      data-index={index}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onMouseMove={() => setSelected(index)}
                      onClick={() => activate(item)}
                      className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors ${
                        isActive ? 'bg-accent text-white' : 'text-ink hover:bg-surface2'
                      }`}
                    >
                      <Icon
                        size={16}
                        className={`shrink-0 ${isActive ? 'text-white' : 'text-muted'}`}
                      />
                      <span className="flex-1 truncate text-sm">{item.label}</span>
                      {item.hint && (
                        <span
                          className={`shrink-0 truncate text-xs ${
                            isActive ? 'text-white/75' : 'text-faint'
                          }`}
                        >
                          {item.hint}
                        </span>
                      )}
                      {isActive && (
                        <CornerDownLeft size={14} className="shrink-0 text-white/80" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center justify-between border-t border-border bg-surface2 px-4 py-2 text-[11px] text-faint">
          <span>{hasQuery ? `${flatItems.length} результат(ов)` : 'Переход по разделам'}</span>
          <span className="flex items-center gap-3">
            <span>↑↓ выбор</span>
            <span>↵ открыть</span>
            <span>esc закрыть</span>
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
}

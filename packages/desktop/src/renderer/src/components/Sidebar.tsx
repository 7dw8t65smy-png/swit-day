import type { CSSProperties } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Sun,
  ListTodo,
  StickyNote,
  Calendar as CalIcon,
  BookOpen,
  BarChart3,
  Settings as Gear,
  Moon,
  ListChecks,
  Flame,
  Wallet,
  LayoutDashboard,
  Bell
} from 'lucide-react';
// FolderKanban kept available if a project section returns later
import { useSettings } from '../lib/settings';
import WorkspaceSwitcher from './WorkspaceSwitcher';

const dragRegionStyle = { WebkitAppRegion: 'drag' } as CSSProperties;
const noDragRegionStyle = { WebkitAppRegion: 'no-drag' } as CSSProperties;

const items = [
  { to: '/today', label: 'Сегодня', icon: Sun },
  { to: '/tasks', label: 'Задачи', icon: ListTodo },
  { to: '/habits', label: 'Рутины', icon: Flame },
  { to: '/notes', label: 'Заметки', icon: StickyNote },
  { to: '/canvas', label: 'Холсты', icon: LayoutDashboard },
  { to: '/calendar', label: 'Календарь', icon: CalIcon },
  { to: '/reminders', label: 'Напоминания', icon: Bell },
  { to: '/playbooks', label: 'Регламенты', icon: ListChecks },
  { to: '/finance', label: 'Расходы', icon: Wallet },
  { to: '/journal', label: 'Журнал', icon: BookOpen },
  { to: '/stats', label: 'Статистика', icon: BarChart3 }
];

export default function Sidebar() {
  const theme = useSettings((s) => s.settings.theme);
  const update = useSettings((s) => s.update);
  const save = useSettings((s) => s.save);
  const setTheme = (t: 'light' | 'dark' | 'system'): void => {
    update('theme', t);
    void save();
  };

  return (
    <aside className="w-[200px] shrink-0 bg-surface border-r border-border flex flex-col">
      <div
        className="px-4 pt-6 pb-4 flex items-center justify-between"
        style={dragRegionStyle}
      >
        <div className="flex items-baseline gap-1">
          <span className="text-xl font-bold text-accent">SWIT</span>
          <span className="text-xl font-light text-ink">Day</span>
        </div>
        <button
          className="text-muted hover:text-ink"
          style={noDragRegionStyle}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>

      <WorkspaceSwitcher />

      <nav className="flex-1 px-2 py-2 space-y-1">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition ${
                isActive
                  ? 'bg-accent text-white'
                  : 'text-ink hover:bg-surface2'
              }`
            }
          >
            <Icon size={16} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="px-2 py-2 border-t border-border space-y-1">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition ${
              isActive ? 'bg-accent text-white' : 'text-ink hover:bg-surface2'
            }`
          }
        >
          <Gear size={16} />
          <span>Настройки</span>
        </NavLink>
      </div>
    </aside>
  );
}

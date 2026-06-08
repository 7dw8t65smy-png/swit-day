import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { useSettings } from './lib/settings';
import Sidebar from './components/Sidebar';
import RightPanel from './components/RightPanel';
import Today from './pages/Today';
import Tasks from './pages/Tasks';
import Notes from './pages/Notes';
import Calendar from './pages/Calendar';
import Journal from './pages/Journal';
import Stats from './pages/Stats';
import Settings from './pages/Settings';
import Playbooks from './pages/Playbooks';
import Habits from './pages/Habits';
import Finance from './pages/Finance';
import CommandPalette from './components/CommandPalette';
import { useCommandPalette } from './hooks/useCommandPalette';

const NAV_KEYS = ['today', 'tasks', 'habits', 'notes', 'calendar', 'playbooks', 'journal', 'stats'];

export default function App() {
  const nav = useNavigate();
  const loc = useLocation();
  const loadSettings = useSettings((s) => s.load);
  const startPage = useSettings((s) => s.settings.start_page);
  const settingsLoaded = useSettings((s) => s.loaded);
  // Right panel only on /today — на /tasks она съедала ширину доски и 4-я
  // колонка уезжала под календарь. /projects = алиас на /tasks, тоже скрываем.
  const showRight = loc.pathname.startsWith('/today');

  // Load settings once on app start. Side-effects (accent color, density,
  // theme) apply inside the store. In packaged builds the renderer can become
  // ready before the in-process server, so retry until settings arrive.
  useEffect(() => {
    void loadSettings();
    const id = window.setInterval(() => {
      if (useSettings.getState().loaded) {
        window.clearInterval(id);
        return;
      }
      void loadSettings();
    }, 500);
    return () => window.clearInterval(id);
  }, [loadSettings]);

  // Redirect to start_page once on first load if user lands on `/`.
  // Track with a ref so the redirect happens only on the very first navigation,
  // not every time the setting changes.
  const didStartRedirect = useRef(false);
  useEffect(() => {
    if (!settingsLoaded || didStartRedirect.current) return;
    didStartRedirect.current = true;
    if (loc.pathname === '/' || loc.pathname === '/today') {
      if (startPage && startPage !== loc.pathname) nav(startPage, { replace: true });
    }
  }, [settingsLoaded, startPage, loc.pathname, nav]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      // Cmd+K / Ctrl+K — командная палитра. Работает даже из инпутов
      // (preventDefault гасит дефолтные хоткеи браузера).
      if (e.key.toLowerCase() === 'k') {
        e.preventDefault();
        useCommandPalette.getState().toggle();
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= 8) {
        e.preventDefault();
        nav('/' + NAV_KEYS[n - 1]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nav]);

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-bg">
        <Routes>
          <Route path="/" element={<Navigate to="/today" replace />} />
          <Route path="/today" element={<Today />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/projects" element={<Navigate to="/tasks" replace />} />
          <Route path="/habits" element={<Habits />} />
          <Route path="/playbooks" element={<Playbooks />} />
          <Route path="/journal" element={<Journal />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/finance" element={<Finance />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
      {showRight && (
        <div className="w-[340px] shrink-0 border-l border-border bg-surface overflow-y-auto">
          <RightPanel />
        </div>
      )}
      <CommandPalette />
    </div>
  );
}

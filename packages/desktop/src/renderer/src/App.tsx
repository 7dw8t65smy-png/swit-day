import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useRef, lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { useSettings } from './lib/settings';
import Sidebar from './components/Sidebar';
import RightPanel from './components/RightPanel';
// Страницы грузим лениво (route-level code-splitting): рендерный бандл был ~1.77MB
// одним куском, теперь каждый маршрут — отдельный чанк, подгружаемый по входу.
const Today = lazy(() => import('./pages/Today'));
const Tasks = lazy(() => import('./pages/Tasks'));
const Notes = lazy(() => import('./pages/Notes'));
const Canvases = lazy(() => import('./pages/Canvases'));
const MapEditor = lazy(() => import('./pages/MapEditor'));
const BoardEditor = lazy(() => import('./pages/BoardEditor'));
const Calendar = lazy(() => import('./pages/Calendar'));
const Journal = lazy(() => import('./pages/Journal'));
const Stats = lazy(() => import('./pages/Stats'));
const Settings = lazy(() => import('./pages/Settings'));
const Playbooks = lazy(() => import('./pages/Playbooks'));
const Habits = lazy(() => import('./pages/Habits'));
const Finance = lazy(() => import('./pages/Finance'));
// Не-маршрутные компоненты остаются обычными (eager) импортами: они нужны на
// каждой странице и/или висят оверлеями.
import CommandPalette from './components/CommandPalette';
import Onboarding from './components/Onboarding';
import ShortcutsHelp from './components/ShortcutsHelp';
import ErrorBoundary from './components/ErrorBoundary';
import ToastHost from './components/ToastHost';
import { useCommandPalette } from './hooks/useCommandPalette';
import { useShortcutsHelp } from './hooks/useShortcutsHelp';
import { pushToast } from './hooks/useToasts';

const NAV_KEYS = ['today', 'tasks', 'habits', 'notes', 'calendar', 'playbooks', 'journal', 'stats'];

// Не перехватываем `?` для оверлея, когда пользователь печатает в поле ввода.
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

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
      // `?` (Shift+/) без модификаторов и не из поля ввода — оверлей горячих клавиш.
      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key === '?') {
        if (isTypingTarget(e.target)) return;
        e.preventDefault();
        useShortcutsHelp.getState().toggle();
        return;
      }
      if (!(e.metaKey || e.ctrlKey)) return;
      // Cmd+K / Ctrl+K — командная палитра. Работает даже из инпутов
      // (preventDefault гасит дефолтные хоткеи браузера).
      if (e.key.toLowerCase() === 'k') {
        e.preventDefault();
        useCommandPalette.getState().toggle();
        return;
      }
      // Cmd+, / Ctrl+, — настройки.
      if (e.key === ',') {
        e.preventDefault();
        nav('/settings');
        return;
      }
      // Cmd+N / Ctrl+N — новая задача (открываем раздел задач).
      if (e.key.toLowerCase() === 'n') {
        e.preventDefault();
        nav('/tasks');
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

  // Глобальная страховочная сеть: множество awaited-вызовов api в страницах не
  // обёрнуты в try/catch, поэтому их отказы становятся unhandled-rejection. Здесь
  // ловим их и всплываем общий тост, чтобы сбои не были полностью молчаливыми.
  // api.req() уже даёт конкретный тост на свои ошибки — дедуп в сторе гасит
  // дубль, а сюда долетают только реально не озвученные исключения.
  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent): void => {
      pushToast({
        kind: 'error',
        message: 'Произошла ошибка. Действие не выполнено.'
      });
      console.error('[App] необработанный отказ промиса:', e.reason);
    };
    window.addEventListener('unhandledrejection', onRejection);
    return () => window.removeEventListener('unhandledrejection', onRejection);
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-bg">
        {/* Граница ошибок ключуется по pathname: краш одной страницы не «кирпичит»
            приложение — переход на другой маршрут пересоздаёт границу и сбрасывает
            упавшее состояние. Sidebar/RightPanel снаружи, чтобы навигация жила. */}
        <ErrorBoundary key={loc.pathname} onReset={() => nav('/today')}>
          {/* Ключ по pathname пересоздаёт контейнер при смене маршрута,
              запуская CSS-анимацию входа (fade + подъём, только transform/opacity). */}
          <div className="animate-page min-h-full">
            {/* Suspense ловит ленивую подгрузку чанка страницы. Внутри контейнера
                с animate-page — и fallback, и сама страница появляются с переходом. */}
            <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route path="/" element={<Navigate to="/today" replace />} />
                <Route path="/today" element={<Today />} />
                <Route path="/tasks" element={<Tasks />} />
                <Route path="/notes" element={<Notes />} />
                <Route path="/canvas" element={<Canvases />} />
                <Route path="/maps" element={<Navigate to="/canvas" replace />} />
                <Route path="/maps/:id" element={<MapEditor />} />
                <Route path="/boards" element={<Navigate to="/canvas" replace />} />
                <Route path="/boards/:id" element={<BoardEditor />} />
                <Route path="/calendar" element={<Calendar />} />
                <Route path="/projects" element={<Navigate to="/tasks" replace />} />
                <Route path="/habits" element={<Habits />} />
                <Route path="/playbooks" element={<Playbooks />} />
                <Route path="/journal" element={<Journal />} />
                <Route path="/stats" element={<Stats />} />
                <Route path="/finance" element={<Finance />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </Suspense>
          </div>
        </ErrorBoundary>
      </main>
      {showRight && (
        <div className="w-[340px] shrink-0 border-l border-border bg-surface overflow-y-auto">
          <RightPanel />
        </div>
      )}
      <CommandPalette />
      <ShortcutsHelp />
      <Onboarding />
      <ToastHost />
    </div>
  );
}

// Минимальный fallback на время подгрузки чанка маршрута: центрированный спиннер
// на токенах. Лёгкий, без layout-сдвигов — занимает всю высоту области страницы.
function PageFallback(): JSX.Element {
  return (
    <div className="flex min-h-full items-center justify-center" role="status" aria-live="polite">
      <Loader2 size={22} className="animate-spin text-muted" aria-label="Загрузка" />
    </div>
  );
}

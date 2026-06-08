import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCw, Home } from 'lucide-react';

/**
 * Граница ошибок рендера. React 18 не даёт хук-эквивалента, поэтому это
 * классовый компонент: getDerivedStateFromError переводит дерево в fallback,
 * componentDidCatch логирует стек.
 *
 * Оборачивает только область страницы в App.tsx (Sidebar/RightPanel остаются
 * снаружи, чтобы навигация работала после краша). App ключует границу по
 * location.pathname — переход на другой маршрут пересоздаёт границу и
 * автоматически сбрасывает упавшее состояние, так что один сломавшийся экран
 * не «кирпичит» всё приложение.
 *
 * Никакого IO здесь нет — только перехват, лог и экран восстановления.
 */

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Вызывается кнопкой «Вернуться на главную»: сбрасывает состояние и ведёт на /today. */
  onReset?: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Детальный контекст в консоль — для отладки в DevTools пакетной сборки.
    console.error('[ErrorBoundary] перехвачена ошибка рендера:', error, info.componentStack);
  }

  private handleReload = (): void => {
    location.reload();
  };

  private handleGoHome = (): void => {
    // Сначала чистим упавшее состояние, затем уводим на главную (через App).
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-full items-center justify-center px-6 py-12">
        <div className="w-full max-w-md rounded-xl border border-border bg-surface p-8 shadow-lg animate-fade-in">
          <div className="flex flex-col items-center text-center">
            <span
              className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl"
              style={{
                color: 'var(--color-danger)',
                background: 'color-mix(in srgb, var(--color-danger) 12%, transparent)'
              }}
            >
              <AlertTriangle size={26} />
            </span>
            <h1 className="text-xl font-semibold tracking-tight text-ink">Что-то пошло не так</h1>
            <p className="mt-2.5 max-w-[320px] text-sm leading-relaxed text-muted">
              Этот экран неожиданно завершился с ошибкой. Можно перезагрузить приложение или
              вернуться на главную — остальные разделы продолжат работать.
            </p>
          </div>

          <details className="mt-5 rounded-md border border-border bg-surface2 px-3 py-2 text-left">
            <summary className="cursor-pointer select-none text-xs font-medium text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              Подробности ошибки
            </summary>
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs leading-snug text-faint">
              {error.message}
              {error.stack ? `\n\n${error.stack}` : ''}
            </pre>
          </details>

          <div className="mt-6 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={this.handleGoHome}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface2 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Home size={15} />
              Вернуться на главную
            </button>
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <RotateCw size={15} />
              Перезагрузить
            </button>
          </div>
        </div>
      </div>
    );
  }
}

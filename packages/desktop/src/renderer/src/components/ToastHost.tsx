import { createPortal } from 'react-dom';
import { AlertCircle, Info, X } from 'lucide-react';
import { useToasts, type Toast } from '../hooks/useToasts';

/**
 * Контейнер тостов. Монтируется один раз в App.tsx, рисует стек уведомлений
 * в правом нижнем углу через портал в <body>, чтобы всплывать поверх любой
 * страницы вне overflow/z-index родителей (как CommandPalette).
 *
 * Состояние читаем из useToasts (zustand). Ошибки — красный/danger акцент,
 * info — нейтральная поверхность. Каждый тост авто-скрывается в сторе, тут
 * только рисуем и даём кнопку закрытия.
 */
export default function ToastHost(): JSX.Element | null {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return createPortal(
    <div className="fixed bottom-4 right-4 z-[120] flex flex-col gap-2 w-[360px] max-w-[calc(100vw-2rem)]">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>,
    document.body
  );
}

function ToastItem({
  toast,
  onDismiss
}: {
  toast: Toast;
  onDismiss: () => void;
}): JSX.Element {
  const isError = toast.kind === 'error';
  const Icon = isError ? AlertCircle : Info;

  // role/aria-live: ошибки — assertive (alert), инфо — polite (status).
  return (
    <div
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      className="animate-toast-in flex items-start gap-3 rounded-md border bg-surface px-3.5 py-3 shadow-lg"
      style={{
        borderColor: isError ? 'var(--color-danger)' : 'var(--color-border)'
      }}
    >
      <span
        className="mt-0.5 shrink-0"
        style={{ color: isError ? 'var(--color-danger)' : 'var(--color-text-muted)' }}
      >
        <Icon size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink leading-snug">{toast.message}</p>
        {toast.detail && (
          <p className="mt-0.5 text-xs text-faint leading-snug break-words">{toast.detail}</p>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Закрыть уведомление"
        className="-mr-1 -mt-0.5 shrink-0 rounded p-1 text-muted transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <X size={15} />
      </button>
    </div>
  );
}

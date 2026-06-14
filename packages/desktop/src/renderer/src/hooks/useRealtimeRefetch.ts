// Перезапрашивает данные страницы, когда приходит realtime-событие или
// меняется активное пространство (оба двигают useAuth.dataVersion).
//
// Важно: НЕ перемонтирует компонент — просто повторно зовёт reload(), поэтому
// скролл, фокус и локальное состояние страницы сохраняются. Первый прогон
// (монтирование) пропускаем: начальную загрузку делает собственный эффект
// страницы, дублировать не нужно.
import { useEffect, useRef } from 'react';
import { useAuth } from '../lib/auth';

export function useRealtimeRefetch(reload: () => void): void {
  const dataVersion = useAuth((s) => s.dataVersion);
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    reloadRef.current();
  }, [dataVersion]);
}

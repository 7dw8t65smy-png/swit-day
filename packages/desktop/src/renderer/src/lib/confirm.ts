import { useSettings } from './settings';

/**
 * Honors the `confirm_delete` setting. Returns `true` if the action should
 * proceed. If the setting is OFF, returns `true` without prompting.
 *
 * Usage:
 *   if (!confirmDelete(`Удалить «${task.title}»?`)) return;
 */
export function confirmDelete(message: string): boolean {
  const enabled = useSettings.getState().settings.confirm_delete;
  if (!enabled) return true;
  return window.confirm(message);
}

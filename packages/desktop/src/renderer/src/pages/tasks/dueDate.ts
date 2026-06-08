import { localDateKey } from '../../lib/date';

export function formatShortDate(d: string): string {
  const today = localDateKey();
  if (d === today) return 'Сегодня';
  const dt = new Date(d + 'T00:00:00');
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (d === localDateKey(tomorrow)) return 'Завтра';
  return dt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

// Relative due-date label + colored tone.
// overdue → red, today → amber, tomorrow → accent, дальше → нейтральный.
export function formatRelativeDue(
  dateStr: string,
  timeStr: string | null | undefined,
  done: boolean
): { label: string; toneClass: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  const time = timeStr ? timeStr.slice(0, 5) : null;

  let label: string;
  let toneClass: string;

  if (diffDays < 0) {
    const abs = Math.abs(diffDays);
    label =
      abs === 1
        ? 'вчера'
        : abs < 7
          ? `${abs} дн. назад`
          : target.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    toneClass = done ? 'text-muted' : 'text-red-500';
  } else if (diffDays === 0) {
    label = time ? `сегодня в ${time}` : 'сегодня';
    toneClass = done ? 'text-muted' : 'text-amber-500';
  } else if (diffDays === 1) {
    label = time ? `завтра в ${time}` : 'завтра';
    toneClass = 'text-accent';
  } else if (diffDays < 7) {
    label = time ? `через ${diffDays} дн. в ${time}` : `через ${diffDays} дн.`;
    toneClass = 'text-muted';
  } else {
    const datePart = target.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    label = time ? `${datePart} в ${time}` : datePart;
    toneClass = 'text-muted';
  }

  return { label, toneClass };
}

/** Human-friendly "обновлён сегодня / вчера / 3 дн. назад / 14 мая". */
export function formatRelative(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - then.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays < 1) return 'сегодня';
  if (diffDays === 1) return 'вчера';
  if (diffDays < 7) return `${diffDays} дн. назад`;
  return then.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

/** «1 шаг», «2 шага», «5 шагов» — RU plural for the step count badge. */
export function pluralizeSteps(n: number): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${n} шагов`;
  if (mod10 === 1) return `${n} шаг`;
  if (mod10 >= 2 && mod10 <= 4) return `${n} шага`;
  return `${n} шагов`;
}

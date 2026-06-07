import { streakTier } from '@swit/shared';

/**
 * Визуализация текущего стрика — «пламя», цвет которого усиливается по
 * мере роста. 100+ получает анимированную корону.
 */
export default function HabitStreakBadge({
  streak,
  unit,
  size = 'sm'
}: {
  streak: number;
  unit: 'day' | 'week' | 'month';
  size?: 'sm' | 'md' | 'lg';
}): JSX.Element {
  const tier = streakTier(streak);
  const unitLabel = unitShortLabel(unit, streak);
  const sizeCls =
    size === 'lg'
      ? 'text-3xl px-3 py-2 gap-2'
      : size === 'md'
        ? 'text-lg px-2.5 py-1.5 gap-1.5'
        : 'text-xs px-2 py-0.5 gap-1';

  // Для холодного состояния — приглушённый вид.
  if (streak <= 0) {
    return (
      <span
        className={`inline-flex items-center rounded-full bg-surface2 text-faint ${sizeCls}`}
        title="Стрик потушен — начни сегодня"
      >
        <span style={{ filter: 'grayscale(1) opacity(0.6)' }}>🔥</span>
        <span>0</span>
      </span>
    );
  }

  // Радужный / royal — спецстили.
  const isRainbow = tier.tier === 'rainbow';
  const isRoyal = tier.tier === 'royal';

  const baseStyle: React.CSSProperties = isRainbow
    ? {
        background:
          'linear-gradient(90deg, #fbbf24, #f97316, #ef4444, #a855f7, #06b6d4)',
        color: '#fff'
      }
    : isRoyal
      ? {
          background:
            'linear-gradient(90deg, #fbbf24, #fde68a, #fbbf24)',
          color: '#7c2d12',
          boxShadow: '0 0 0 2px #fde68a inset, 0 0 12px rgba(251, 191, 36, 0.6)'
        }
      : {
          background: tier.color + '22',
          color: tier.color
        };

  // Для royal — анимированное мерцание ободка.
  const animationCls = isRoyal ? 'streak-royal-pulse' : '';

  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold ${sizeCls} ${animationCls}`}
      style={baseStyle}
      title={`Стрик ${streak} ${unitLabel}${tier.label !== 'Потушен' ? ` · ${tier.label}` : ''}`}
    >
      <span aria-hidden>{isRoyal ? '👑' : isRainbow ? '✨' : '🔥'}</span>
      <span className="timer-font">{streak}</span>
      <span className="opacity-70 font-normal">{unitLabel}</span>
    </span>
  );
}

function unitShortLabel(unit: 'day' | 'week' | 'month', n: number): string {
  if (unit === 'day') return pl(n, 'день', 'дня', 'дней');
  if (unit === 'week') return pl(n, 'неделя', 'недели', 'недель');
  return pl(n, 'месяц', 'месяца', 'месяцев');
}

function pl(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

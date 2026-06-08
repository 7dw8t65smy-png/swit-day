import { Bell, Check, AlertTriangle } from 'lucide-react';
import type { Habit, HabitStats } from '@swit/shared';
import { minutesUntilWindowEnd } from '@swit/shared';
import HabitStreakBadge from '../../components/HabitStreakBadge';
import { cadenceLabel } from '../../lib/habits';
import type { RowState } from './types';

export function RoutineRow({
  habit,
  state,
  monthCount,
  stats,
  onToggle,
  onOpen,
  onEdit
}: {
  habit: Habit;
  state: RowState;
  monthCount: number;
  stats?: HabitStats;
  onToggle?: () => void;
  onOpen: () => void;
  onEdit: () => void;
}): JSX.Element {
  const done = state === 'done-today';
  const archived = state === 'archived';
  const dueToday = state === 'due-today';
  const color = habit.color ?? '#2563EB';
  // Окно подтверждения — только для не-weekly_n и due-today.
  const minsLeft =
    dueToday && habit.cadence !== 'weekly_n'
      ? minutesUntilWindowEnd(habit, new Date(), new Date())
      : null;
  const isWarning = minsLeft !== null && minsLeft > 0 && minsLeft <= 60;
  const isExpired = minsLeft !== null && minsLeft <= 0;

  return (
    <div
      className={`group flex items-center gap-3 bg-surface rounded-md shadow-sm border transition ${
        dueToday
          ? 'border-accent/40 hover:border-accent'
          : done
            ? 'border-transparent opacity-70'
            : 'border-transparent hover:border-border'
      }`}
      style={
        dueToday
          ? { borderLeftWidth: 3, borderLeftColor: color }
          : undefined
      }
    >
      {/* Check button — only meaningful when due today */}
      {onToggle && !archived ? (
        <button
          onClick={onToggle}
          aria-label={done ? 'Отменить выполнение' : 'Отметить выполненным'}
          className={`ml-3 w-6 h-6 rounded-md shrink-0 flex items-center justify-center transition ${
            done ? '' : 'border-2 border-border hover:border-accent'
          }`}
          style={done ? { background: color } : undefined}
        >
          {done && <Check size={14} className="text-white" />}
        </button>
      ) : (
        <div className="ml-3 w-6 h-6 shrink-0 flex items-center justify-center">
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ background: archived ? 'var(--color-border)' : color, opacity: 0.6 }}
          />
        </div>
      )}

      <button
        onClick={onOpen}
        className="flex-1 min-w-0 text-left px-1 py-3 flex items-center gap-3"
      >
        <span className="text-xl leading-none shrink-0">{habit.icon ?? '✨'}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-sm font-medium truncate ${
                done ? 'line-through text-muted' : archived ? 'text-muted' : ''
              }`}
            >
              {habit.title}
            </span>
            {stats && !archived && (
              <HabitStreakBadge
                streak={stats.current_streak}
                unit={stats.unit}
                size="sm"
              />
            )}
          </div>
          <div className="text-[11px] text-muted truncate flex items-center gap-1.5 mt-0.5">
            <span>{cadenceLabel(habit)}</span>
            {habit.remind_time && (
              <span className="inline-flex items-center gap-0.5 text-accent">
                <Bell size={9} />
                {habit.remind_time}
              </span>
            )}
            {monthCount > 0 && !archived && (
              <span className="text-faint">· {monthCount} в этом месяце</span>
            )}
            {stats && stats.best_streak > 0 && !archived && (
              <span className="text-faint">· лучший {stats.best_streak}</span>
            )}
          </div>
          {(isWarning || isExpired) && !done && (
            <div
              className={`mt-1 text-[10px] font-medium flex items-center gap-1 ${
                isExpired ? 'text-red-600' : 'text-amber-600'
              }`}
            >
              <AlertTriangle size={10} />
              {isExpired
                ? 'Окно истекло — стрик прервётся'
                : `Стрик прервётся через ${minsLeft} мин`}
            </div>
          )}
        </div>
      </button>
      <button
        onClick={onEdit}
        title="Редактировать"
        className="mr-2 text-faint hover:text-accent p-1 opacity-0 group-hover:opacity-100"
      >
        ✎
      </button>
    </div>
  );
}

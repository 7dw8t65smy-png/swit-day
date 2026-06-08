import { format, subDays } from 'date-fns';
import type { Habit, HabitLog, HabitStats } from '@swit/shared';
import { streakTier, habitStartDate } from '@swit/shared';
import Modal from '../../components/Modal';
import HabitStreakBadge from '../../components/HabitStreakBadge';
import { isHabitDueOn } from '../../lib/habits';
import { pl } from './helpers';

// ---- Детальная модалка рутины: stats, бэйджи, heatmap, история ----

export function HabitDetailModal({
  habit,
  stats,
  logs,
  onClose,
  onEdit
}: {
  habit: Habit | null;
  stats: HabitStats | undefined;
  logs: HabitLog[];
  onClose: () => void;
  onEdit: () => void;
}): JSX.Element {
  if (!habit) {
    return (
      <Modal open={false} onClose={onClose} title="">
        <div />
      </Modal>
    );
  }
  const tier = streakTier(stats?.current_streak ?? 0);
  return (
    <Modal
      open={!!habit}
      onClose={onClose}
      title={`${habit.icon ?? ''} ${habit.title}`}
      wide
      footer={
        <>
          <button onClick={onClose} className="px-3 py-1.5 rounded-md text-sm border border-border">
            Закрыть
          </button>
          <button
            onClick={onEdit}
            className="px-4 py-1.5 rounded-md text-sm bg-accent text-white hover:bg-accent-hover"
          >
            Редактировать
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Большой стрик */}
        <section
          className="rounded-lg p-5 text-center"
          style={{ background: tier.color + '18' }}
        >
          <div className="text-[11px] uppercase tracking-wide text-muted">
            Текущий стрик
          </div>
          <div className="mt-2 flex items-center justify-center">
            <HabitStreakBadge
              streak={stats?.current_streak ?? 0}
              unit={stats?.unit ?? 'day'}
              size="lg"
            />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
            <DetailMetric label="Лучший" value={String(stats?.best_streak ?? 0)} />
            <DetailMetric label="Всего" value={String(stats?.total_done ?? 0)} />
            <DetailMetric
              label="Цикл"
              value={
                stats?.unit === 'day'
                  ? 'дни'
                  : stats?.unit === 'week'
                    ? 'недели'
                    : 'месяцы'
              }
            />
          </div>
        </section>

        {/* Прогресс недели/месяца */}
        {stats?.week_progress && (
          <section className="rounded-lg border border-border p-4">
            <div className="text-xs uppercase text-muted mb-2">
              Эта неделя · {stats.week_progress.done}/{stats.week_progress.target}
              {stats.week_progress.days_left > 0 && (
                <span className="text-faint normal-case">
                  {' '}
                  · осталось {stats.week_progress.days_left}{' '}
                  {pl(stats.week_progress.days_left, 'день', 'дня', 'дней')}
                </span>
              )}
            </div>
            <div className="h-2 rounded-full bg-surface2 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(
                    100,
                    (stats.week_progress.done / Math.max(1, stats.week_progress.target)) * 100
                  )}%`,
                  background:
                    stats.week_progress.done >= stats.week_progress.target
                      ? '#22C55E'
                      : habit.color ?? '#2563EB'
                }}
              />
            </div>
          </section>
        )}

        {stats?.month_progress && (
          <section className="rounded-lg border border-border p-4 text-sm">
            <div className="text-xs uppercase text-muted mb-1">Этот месяц</div>
            {stats.month_progress.done ? (
              <span className="text-green-600 font-medium">
                ✓ Выполнено в этом месяце
              </span>
            ) : (
              <span className="text-muted">
                Контрольная дата —{' '}
                <b className="text-ink">{stats.month_progress.target_day}-е число</b>
              </span>
            )}
          </section>
        )}

        {/* Бэйджи */}
        {stats && (
          <section>
            <div className="text-xs uppercase text-muted mb-2">Бэйджи</div>
            <div className="grid grid-cols-3 gap-2">
              {stats.badges.map((b) => {
                const remaining =
                  b.kind === 'streak'
                    ? Math.max(0, b.threshold - stats.current_streak)
                    : Math.max(0, b.threshold - stats.total_done);
                return (
                  <div
                    key={b.id}
                    className={`rounded-md p-2 border text-center text-xs ${
                      b.unlocked
                        ? 'border-accent/40 bg-accent-light/40'
                        : 'border-border bg-surface2/40 opacity-70'
                    }`}
                  >
                    <div className={`text-2xl ${b.unlocked ? '' : 'grayscale opacity-50'}`}>
                      {b.emoji}
                    </div>
                    <div className="font-medium mt-1 truncate">{b.label}</div>
                    <div className="text-[10px] text-muted">
                      {b.unlocked
                        ? 'Разблокировано'
                        : `Осталось ${remaining} ${
                            b.kind === 'streak'
                              ? stats.unit === 'day'
                                ? 'дн'
                                : stats.unit === 'week'
                                  ? 'нед'
                                  : 'мес'
                              : 'раз'
                          }`}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Heatmap последних 90 дней */}
        <section>
          <div className="text-xs uppercase text-muted mb-2">
            Активность за 90 дней
          </div>
          <Heatmap habit={habit} logs={logs} />
        </section>

        {/* История */}
        <section>
          <div className="text-xs uppercase text-muted mb-2">История последних отметок</div>
          <ul className="text-xs divide-y divide-border max-h-48 overflow-auto">
            {logs.slice(0, 30).map((l) => (
              <li
                key={l.id}
                className="py-1.5 flex items-center gap-2"
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    l.status === 'done' ? 'bg-green-500' : 'bg-red-400'
                  }`}
                />
                <span className="timer-font text-muted">{l.date}</span>
                <span className="flex-1">
                  {l.status === 'done'
                    ? `Выполнено${l.count > 1 ? ` ×${l.count}` : ''}`
                    : 'Пропуск'}
                </span>
                {l.note && <span className="text-faint truncate">{l.note}</span>}
              </li>
            ))}
            {logs.length === 0 && (
              <li className="py-2 text-muted text-center">Ещё пусто</li>
            )}
          </ul>
        </section>
      </div>
    </Modal>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="bg-surface rounded-md py-2">
      <div className="text-[10px] uppercase text-muted">{label}</div>
      <div className="text-base font-semibold timer-font mt-0.5">{value}</div>
    </div>
  );
}

function Heatmap({ habit, logs }: { habit: Habit; logs: HabitLog[] }): JSX.Element {
  const days = 90;
  const cells: { date: string; status: 'done' | 'missed' | 'open' | 'skip' }[] = [];
  const now = new Date();
  const startDate = habitStartDate(habit);
  const byDate = new Map<string, HabitLog>();
  for (const l of logs) byDate.set(l.date, l);
  for (let i = days - 1; i >= 0; i--) {
    const d = subDays(now, i);
    const dateStr = format(d, 'yyyy-MM-dd');
    // До создания рутины — нейтральные серые клетки.
    if (dateStr < startDate) {
      cells.push({ date: dateStr, status: 'skip' });
      continue;
    }
    if (habit.cadence !== 'weekly_n' && !isHabitDueOn(habit, d)) {
      cells.push({ date: dateStr, status: 'skip' });
      continue;
    }
    const log = byDate.get(dateStr);
    if (log) {
      cells.push({
        date: dateStr,
        status: log.status === 'done' ? 'done' : 'missed'
      });
    } else if (i === 0) {
      cells.push({ date: dateStr, status: 'open' });
    } else {
      cells.push({ date: dateStr, status: 'missed' });
    }
  }
  return (
    <div className="flex flex-wrap gap-0.5">
      {cells.map((c) => (
        <div
          key={c.date}
          title={`${c.date}: ${
            c.status === 'done'
              ? 'выполнено'
              : c.status === 'missed'
                ? 'пропуск'
                : c.status === 'open'
                  ? 'ещё можно отметить'
                  : 'не due'
          }`}
          className="w-3 h-3 rounded-sm"
          style={{
            background:
              c.status === 'done'
                ? habit.color ?? '#2563EB'
                : c.status === 'missed'
                  ? '#EF4444'
                  : c.status === 'open'
                    ? '#F59E0B'
                    : 'var(--color-surface2)'
          }}
        />
      ))}
    </div>
  );
}

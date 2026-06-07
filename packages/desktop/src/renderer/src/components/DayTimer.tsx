import { Play, Pause, Coffee, Square, BookOpen, RotateCcw } from 'lucide-react';
import type { DayTotals, DayTimerStatus } from '@swit/shared';
import { fmtHMS, fmtHM, fmtClock } from '../lib/format';

interface Props {
  status: DayTimerStatus;
  totals: DayTotals | null;
  sessionSeconds: number;
  dayWorkSeconds: number;
  dayBreakSeconds: number;
  dayPauseSeconds: number;
  tasksDone: number;
  onStart: () => void;
  onPause: () => void;
  onBreak: () => void;
  onEnd: () => void;
  onOpenJournal: () => void;
  onStartNewDay: () => void;
}

export default function DayTimer({
  status,
  totals,
  sessionSeconds,
  dayWorkSeconds,
  dayBreakSeconds,
  dayPauseSeconds,
  tasksDone,
  onStart,
  onPause,
  onBreak,
  onEnd,
  onOpenJournal,
  onStartNewDay
}: Props) {
  const segments = totals?.segments ?? [];
  const liveSegments = segments.map((s) => {
    if (s.ended_at) return s;
    const live = Math.max(0, Math.floor((Date.now() - new Date(s.started_at).getTime()) / 1000));
    return { ...s, duration_s: live };
  });
  const totalDuration = liveSegments.reduce((a, s) => a + s.duration_s, 0) || 1;

  if (status === 'finished') {
    return (
      <section className="bg-surface rounded-lg shadow-sm p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase text-muted flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-faint" /> День завершён
            </div>
            <div className="text-[40px] font-bold timer-font text-ink leading-none mt-1">
              {fmtHM(dayWorkSeconds)}
            </div>
            <div className="text-sm text-muted mt-1">
              Итоги сохранены в журнал · {totals?.date}
            </div>
          </div>
          <button
            onClick={onOpenJournal}
            className="px-3 py-2 rounded-md text-sm border border-border hover:bg-surface2 flex items-center gap-2 shrink-0"
          >
            <BookOpen size={14} /> Открыть в журнале
          </button>
        </div>

        <div className="grid grid-cols-5 gap-4 mt-5 pt-4 border-t border-border">
          <Metric label="Работа" value={fmtHM(dayWorkSeconds)} accent="work" />
          <Metric label="Паузы" value={fmtHM(dayPauseSeconds)} accent="pause" />
          <Metric label="Перерывы" value={fmtHM(dayBreakSeconds)} accent="break" />
          <Metric label="Сессий" value={String(totals?.sessions_count ?? 0)} />
          <Metric label="Задач готово" value={String(tasksDone)} />
        </div>

        {liveSegments.length > 0 && (
          <div className="mt-4 flex h-2 rounded-full overflow-hidden bg-surface2">
            {liveSegments.map((s, i) => (
              <div
                key={i}
                title={`${labelType(s.type)} · ${fmtHM(s.duration_s)}`}
                style={{
                  width: `${(s.duration_s / totalDuration) * 100}%`,
                  background:
                    s.type === 'work'
                      ? 'var(--color-work)'
                      : s.type === 'break'
                        ? 'var(--color-break)'
                        : 'var(--color-pause)'
                }}
              />
            ))}
          </div>
        )}

        <div className="mt-5 pt-4 border-t border-border">
          <div className="text-xs uppercase text-muted mb-2">Что дальше?</div>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={onStart}
              className="flex flex-col items-start gap-1 px-4 py-3 rounded-md border border-border hover:bg-surface2 hover:border-accent transition text-left"
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                <RotateCcw size={14} /> Записать ещё работу
              </div>
              <div className="text-xs text-muted">
                К этому же дню. Метрики и журнал дополнятся.
              </div>
            </button>
            <button
              onClick={onStartNewDay}
              className="flex flex-col items-start gap-1 px-4 py-3 rounded-md bg-accent text-white hover:bg-accent-hover transition text-left"
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                <Play size={14} /> Начать новый день
              </div>
              <div className="text-xs opacity-80">
                Свежий счёт с 00:00. Сегодняшние итоги останутся в журнале.
              </div>
            </button>
          </div>
        </div>
      </section>
    );
  }

  const hasAccum = dayWorkSeconds > 0 || dayBreakSeconds > 0 || dayPauseSeconds > 0;
  const canEndDay = status !== 'idle' || hasAccum;
  const canStartBreak = status !== 'on_break' && (status !== 'idle' || hasAccum);

  // Count which session this is. Work and break counted separately.
  const workSessionNum = segments.filter((s) => s.type === 'work').length;
  const breakSessionNum = segments.filter((s) => s.type === 'break').length;
  const sessionLabel =
    status === 'on_break'
      ? `Перерыв #${Math.max(1, breakSessionNum)}`
      : status === 'running'
        ? `Сессия #${Math.max(1, workSessionNum)}`
        : status === 'paused'
          ? `Пауза после сессии #${Math.max(1, workSessionNum)}`
          : 'Сессия';

  // How much the current session has added to today's total. Equals sessionSeconds when running work.
  const sessionContribution = sessionSeconds;

  return (
    <section className="bg-surface rounded-lg shadow-sm p-6">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <div className="text-xs uppercase text-muted">{sessionLabel}</div>
          <div className="text-[44px] font-bold timer-font text-ink leading-none">
            {fmtHMS(sessionSeconds)}
          </div>
          <div className="text-sm mt-1 flex items-center gap-2">
            <StatusDot status={status} />
            <span className="text-muted">
              {status === 'running' &&
                (workSessionNum > 1 ? 'Продолжаем рабочий день' : 'Идёт работа')}
              {status === 'paused' && 'На паузе · нажми «Продолжить» когда готов'}
              {status === 'on_break' && 'Перерыв'}
              {status === 'idle' && (hasAccum ? 'Готов продолжить' : 'День не запущен')}
            </span>
          </div>
        </div>
        {hasAccum && (
          <div className="text-right">
            <div className="text-[10px] uppercase text-muted">Сегодня всего</div>
            <div
              className="text-2xl font-semibold timer-font"
              style={{ color: 'var(--color-work)' }}
            >
              {fmtHM(dayWorkSeconds)}
            </div>
            {status === 'running' && sessionContribution > 0 ? (
              <div
                className="text-[11px] timer-font animate-pulse"
                style={{ color: 'var(--color-work)' }}
              >
                +{fmtHMS(sessionContribution)} в этой сессии
              </div>
            ) : (
              <div className="text-[10px] text-muted">
                Начал в {fmtClock(totals?.day_started_at ?? null)}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 gap-4 mt-5 pt-4 border-t border-border">
        <Metric label="Работа" value={fmtHM(dayWorkSeconds)} accent="work" />
        <Metric label="Паузы" value={fmtHM(dayPauseSeconds)} accent="pause" />
        <Metric label="Перерывы" value={fmtHM(dayBreakSeconds)} accent="break" />
        <Metric label="Сессий" value={String(totals?.sessions_count ?? 0)} />
      </div>

      {liveSegments.length > 0 && (
        <div className="mt-4 flex h-2 rounded-full overflow-hidden bg-surface2">
          {liveSegments.map((s, i) => (
            <div
              key={i}
              title={`${labelType(s.type)} · ${fmtHM(s.duration_s)}`}
              style={{
                width: `${(s.duration_s / totalDuration) * 100}%`,
                background:
                  s.type === 'work'
                    ? 'var(--color-work)'
                    : s.type === 'break'
                      ? 'var(--color-break)'
                      : 'var(--color-pause)'
              }}
            />
          ))}
        </div>
      )}

      <div className="flex gap-2 mt-5">
        {status !== 'running' && status !== 'on_break' && (
          <button
            onClick={onStart}
            className="bg-accent text-white px-4 py-2 rounded-md text-sm hover:bg-accent-hover flex items-center gap-2"
          >
            <Play size={14} /> {hasAccum ? 'Продолжить' : 'Старт'}
          </button>
        )}
        {status === 'running' && (
          <button
            onClick={onPause}
            className="bg-surface2 text-ink px-4 py-2 rounded-md text-sm border border-border flex items-center gap-2"
          >
            <Pause size={14} /> Пауза
          </button>
        )}
        {canStartBreak && (
          <button
            onClick={onBreak}
            className="bg-surface2 text-ink px-4 py-2 rounded-md text-sm border border-border flex items-center gap-2"
          >
            <Coffee size={14} /> Перерыв
          </button>
        )}
        {status === 'on_break' && (
          <button
            onClick={onStart}
            className="bg-accent text-white px-4 py-2 rounded-md text-sm hover:bg-accent-hover flex items-center gap-2"
          >
            <Play size={14} /> Вернуться к работе
          </button>
        )}
        <button
          onClick={onEnd}
          disabled={!canEndDay}
          className="text-danger px-4 py-2 rounded-md text-sm border border-border flex items-center gap-2 ml-auto disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Square size={14} /> Завершить день
        </button>
      </div>
    </section>
  );
}

function labelType(t: 'work' | 'break' | 'pause'): string {
  return t === 'work' ? 'Работа' : t === 'break' ? 'Перерыв' : 'Пауза';
}

function StatusDot({ status }: { status: DayTimerStatus }) {
  const color =
    status === 'running'
      ? 'var(--color-work)'
      : status === 'on_break'
        ? 'var(--color-break)'
        : status === 'paused'
          ? 'var(--color-pause)'
          : 'var(--color-text-faint)';
  const pulse = status === 'running' || status === 'on_break';
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${pulse ? 'animate-pulse' : ''}`}
      style={{ background: color }}
    />
  );
}

function Metric({
  label,
  value,
  accent
}: {
  label: string;
  value: string;
  accent?: 'work' | 'pause' | 'break';
}) {
  const color =
    accent === 'work'
      ? 'var(--color-work)'
      : accent === 'pause'
        ? 'var(--color-pause)'
        : accent === 'break'
          ? 'var(--color-break)'
          : undefined;
  return (
    <div>
      <div className="text-[11px] uppercase text-muted">{label}</div>
      <div
        className="text-base font-medium timer-font mt-0.5"
        style={color ? { color } : undefined}
      >
        {value}
      </div>
    </div>
  );
}

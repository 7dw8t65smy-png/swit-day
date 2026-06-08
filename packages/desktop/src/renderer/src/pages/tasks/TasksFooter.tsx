import { useState } from 'react';
import {
  Flame,
  Check,
  AlertTriangle,
  Clock,
  CheckCircle2,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import type { TaskStats } from './types';

// --- Sticky footer with stats and "done today" strip ---
//
// Always-visible bar at the bottom of the Tasks page. Left side shows live
// counters (остатков, сделано, срочных, просрочено, дедлайн сегодня). Right side
// hosts an expand toggle for the "Сделано сегодня" strip — collapsed by default,
// hidden entirely when there's nothing done today.

export function TasksFooter({
  stats,
  onOpenTask
}: {
  stats: TaskStats;
  onOpenTask: (id: string) => void;
}): JSX.Element {
  const [doneOpen, setDoneOpen] = useState(false);
  const hasDone = stats.doneToday > 0;

  return (
    <div className="sticky bottom-0 -mx-6 mt-4 bg-surface border-t border-border shadow-[0_-2px_8px_rgba(0,0,0,0.04)] z-10">
      {hasDone && doneOpen && (
        <div className="px-6 py-2 border-b border-border bg-surface2/40">
          <div className="text-[10px] uppercase tracking-wide text-muted mb-1.5">
            Сделано сегодня
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {stats.doneTodayTasks.map((t) => (
              <button
                key={t.id}
                onClick={() => onOpenTask(t.id)}
                title={t.title}
                className="px-2 py-1 rounded-full text-[11px] bg-surface border border-border text-muted line-through hover:bg-accent-light hover:text-accent hover:border-accent transition max-w-[200px] truncate"
              >
                <Check size={10} className="inline -mt-0.5 mr-1 text-green-600" />
                {t.title}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="px-6 py-2 flex items-center gap-3 text-xs flex-wrap">
        <Metric
          icon={<Clock size={13} className="text-muted" />}
          label="Осталось"
          value={stats.remaining}
        />
        <Metric
          icon={<CheckCircle2 size={13} className="text-green-600" />}
          label="Сегодня сделано"
          value={stats.doneToday}
        />
        {stats.urgent > 0 && (
          <Metric
            icon={<Flame size={13} className="text-red-500" />}
            label="Срочно"
            value={stats.urgent}
            tone="urgent"
          />
        )}
        {stats.overdue > 0 && (
          <Metric
            icon={<AlertTriangle size={13} className="text-red-500" />}
            label="Просрочено"
            value={stats.overdue}
            tone="urgent"
          />
        )}
        {stats.dueToday > 0 && (
          <Metric
            icon={<Clock size={13} className="text-amber-500" />}
            label="Дедлайн сегодня"
            value={stats.dueToday}
            tone="warn"
          />
        )}

        {hasDone && (
          <button
            onClick={() => setDoneOpen((v) => !v)}
            className="ml-auto flex items-center gap-1 text-xs text-muted hover:text-ink transition"
          >
            {doneOpen ? 'Скрыть выполненные' : `Показать выполненные (${stats.doneToday})`}
            {doneOpen ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
          </button>
        )}
      </div>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  tone
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone?: 'urgent' | 'warn';
}): JSX.Element {
  const valueColor =
    tone === 'urgent' ? 'text-red-500' : tone === 'warn' ? 'text-amber-600' : 'text-ink';
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface2">
      {icon}
      <span className="text-muted">{label}:</span>
      <span className={`font-semibold timer-font ${valueColor}`}>{value}</span>
    </div>
  );
}

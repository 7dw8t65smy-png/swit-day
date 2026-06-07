import { useEffect, useState } from 'react';
import { Square } from 'lucide-react';
import type { Project, Task, TaskTimeLog } from '@swit/shared';
import { fmtHMS } from '../lib/format';
import ProjectBadge from './ProjectBadge';
import PriorityBadge from './PriorityBadge';

interface Props {
  task: Task | null;
  project: Project | null;
  activeLog: TaskTimeLog | null;
  baseSecondsToday: number; // closed logs for this task today
  onStop: () => void;
}

export default function CurrentTask({ task, project, activeLog, baseSecondsToday, onStop }: Props) {
  const [, force] = useState(0);

  useEffect(() => {
    if (!activeLog) return undefined;
    const id = window.setInterval(() => force((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, [activeLog?.id]);

  const live =
    activeLog && !activeLog.ended_at
      ? Math.floor((Date.now() - new Date(activeLog.started_at).getTime()) / 1000)
      : 0;
  const total = baseSecondsToday + live;

  if (!task) {
    return (
      <section className="bg-surface rounded-lg shadow-sm p-4 border border-dashed border-border">
        <div className="text-xs uppercase text-muted">Текущая задача</div>
        <div className="text-sm text-muted mt-1">
          Нажми ▶ на любой задаче ниже, чтобы засечь время
        </div>
      </section>
    );
  }

  return (
    <section className="bg-surface rounded-lg shadow-sm p-4 border-l-4 border-accent">
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="text-xs uppercase text-muted">Текущая задача</div>
          <div className="font-medium text-base mt-0.5 truncate">{task.title}</div>
          <div className="flex items-center gap-2 mt-1">
            <ProjectBadge project={project} />
            <PriorityBadge priority={task.priority} />
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold timer-font" style={{ color: 'var(--color-accent)' }}>
            {fmtHMS(total)}
          </div>
          <button
            onClick={onStop}
            className="mt-1 px-3 py-1 text-xs rounded-md border border-border hover:bg-surface2 flex items-center gap-1 ml-auto"
            disabled={!activeLog}
          >
            <Square size={12} /> Стоп
          </button>
        </div>
      </div>
    </section>
  );
}

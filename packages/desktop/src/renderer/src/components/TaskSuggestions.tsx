import { useMemo } from 'react';
import { Sparkles, Play, Pin } from 'lucide-react';
import type { Project, Task } from '@swit/shared';
import { suggestTasks } from '../lib/taskScore';
import { api } from '../api';
import ProjectBadge from './ProjectBadge';
import PriorityBadge from './PriorityBadge';
import DifficultyBadge from './DifficultyBadge';

interface Props {
  tasks: Task[];
  projects: Map<string, Project>;
  today: string;
  excludeIds?: Set<string>;
  onChanged: () => Promise<void>;
  onStartTimer?: (taskId: string) => Promise<void>;
  onOpenTask?: (taskId: string) => void;
}

export default function TaskSuggestions({
  tasks,
  projects,
  today,
  excludeIds,
  onChanged,
  onStartTimer,
  onOpenTask
}: Props) {
  const suggestions = useMemo(
    () => suggestTasks(tasks, today, excludeIds ?? new Set(), 4),
    [tasks, today, excludeIds]
  );

  if (suggestions.length === 0) return null;

  async function pinToToday(id: string) {
    await api.updateTask(id, { due_date: today });
    await onChanged();
  }

  async function complete(id: string) {
    await api.updateTask(id, { status: 'done' });
    await onChanged();
  }

  return (
    <section className="bg-surface rounded-lg shadow-sm p-5 border-l-4 border-accent">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={16} className="text-accent" />
        <h3 className="text-sm font-medium">Что сделать сейчас?</h3>
        <span className="text-[11px] text-muted ml-auto">по сложности и важности</span>
      </div>
      <ul className="space-y-1">
        {suggestions.map(({ task, reason }) => (
          <li
            key={task.id}
            onClick={() => onOpenTask?.(task.id)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-surface2 group cursor-pointer"
          >
            <input
              type="checkbox"
              checked={task.status === 'done'}
              onClick={(e) => e.stopPropagation()}
              onChange={() => complete(task.id)}
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate">{task.title}</div>
              <div className="text-[11px] text-muted mt-0.5 flex items-center gap-1.5 flex-wrap">
                <span className="text-accent">{reason}</span>
                {task.project_id && (
                  <>
                    <span>·</span>
                    <span>{projects.get(task.project_id)?.name ?? ''}</span>
                  </>
                )}
              </div>
            </div>
            <DifficultyBadge difficulty={task.difficulty ?? 'medium'} />
            <PriorityBadge priority={task.priority} />
            {task.due_date !== today && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void pinToToday(task.id);
                }}
                className="text-faint hover:text-accent p-1 opacity-0 group-hover:opacity-100"
                title="Запланировать на сегодня"
              >
                <Pin size={13} />
              </button>
            )}
            {onStartTimer && task.status !== 'done' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void onStartTimer(task.id);
                }}
                className="w-7 h-7 rounded-md text-faint hover:text-accent hover:bg-accent-light opacity-0 group-hover:opacity-100 flex items-center justify-center"
                title="Засечь время"
              >
                <Play size={12} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

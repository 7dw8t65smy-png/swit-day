import { GripVertical } from 'lucide-react';
import { api } from '../../api';
import type { Task } from '@swit/shared';
import { PRIORITY_COLOR } from '../../lib/priority';
import PriorityBadge from '../../components/PriorityBadge';
import DifficultyBadge from '../../components/DifficultyBadge';
import { formatRelativeDue } from './dueDate';

export function TaskCard({
  task,
  onClick,
  onChanged,
  subtaskCount,
  subtaskDone
}: {
  task: Task;
  onClick: () => void;
  onChanged: () => Promise<void>;
  subtaskCount?: number;
  subtaskDone?: number;
}) {
  async function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    const updated = await api.updateTask(task.id, {
      status: task.status === 'done' ? 'pending' : 'done'
    });
    await onChanged();
  }
  const accent = PRIORITY_COLOR[task.priority];
  const due = task.due_date
    ? formatRelativeDue(task.due_date, task.due_time, task.status === 'done')
    : null;
  const hasFooter =
    !!due ||
    task.priority !== 'normal' ||
    (task.difficulty && task.difficulty !== 'medium') ||
    (subtaskCount ?? 0) > 0;

  return (
    <div
      onClick={onClick}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/task-id', task.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      className={`bg-surface rounded-md cursor-pointer hover:shadow-md hover:border-accent/40 transition shadow-sm group border border-transparent ${
        task.status === 'done' ? 'opacity-60' : ''
      }`}
      style={
        task.priority !== 'normal'
          ? { borderLeft: `3px solid ${accent}` }
          : { borderLeft: '3px solid transparent' }
      }
    >
      <div className="flex items-start gap-1 p-2.5 pl-1">
        <div
          className="self-stretch flex items-center px-0.5 -my-2.5 py-2.5 text-faint/40 group-hover:text-muted cursor-grab active:cursor-grabbing transition"
          title="Перетащить задачу в другой проект"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical size={14} />
        </div>
        <input
          type="checkbox"
          checked={task.status === 'done'}
          onChange={() => {}}
          onClick={toggle}
          className="mt-0.5 shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div
            className={`text-sm leading-tight ${
              task.status === 'done' ? 'line-through text-muted' : ''
            }`}
          >
            {task.title}
          </div>
          {hasFooter && (
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <DifficultyBadge difficulty={task.difficulty ?? 'medium'} />
              <PriorityBadge priority={task.priority} />
              {subtaskCount !== undefined && subtaskCount > 0 && (
                <span
                  className="text-[10px] text-muted flex items-center gap-0.5"
                  title={`Подзадачи: ${subtaskDone ?? 0} из ${subtaskCount} готово`}
                >
                  ✎ {subtaskDone ?? 0}/{subtaskCount}
                </span>
              )}
              {due && (
                <span
                  className={`text-[10px] font-medium ${due.toneClass}`}
                  title={`Дедлайн: ${task.due_date}${task.due_time ? ' в ' + task.due_time.slice(0, 5) : ''}`}
                >
                  {due.label}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

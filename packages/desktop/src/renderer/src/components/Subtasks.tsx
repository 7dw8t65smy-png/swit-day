import { useEffect, useState } from 'react';
import { Plus, Trash2, ListTree } from 'lucide-react';
import type { Task, TaskDifficulty, TaskPriority } from '@swit/shared';
import { api } from '../api';
import { PRIORITIES, PRIORITY_LABEL, sortByPriority } from '../lib/priority';
import { DIFFICULTIES, DIFFICULTY_ICON } from '../lib/difficulty';
import { useRealtimeRefetch } from '../hooks/useRealtimeRefetch';
import PriorityBadge from './PriorityBadge';
import DifficultyBadge from './DifficultyBadge';

interface Props {
  parent: Task;
  /** Click on a subtask to open it in drawer. */
  onOpenTask?: (id: string) => void;
}

export default function Subtasks({ parent, onOpenTask }: Props) {
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [difficulty, setDifficulty] = useState<TaskDifficulty>('medium');

  useEffect(() => {
    void load();
  }, [parent.id]);
  useRealtimeRefetch(() => void load());

  async function load() {
    const list = await api.listTasks({ parent_task_id: parent.id });
    setSubtasks(list);
  }

  async function add() {
    const t = title.trim();
    if (!t) return;
    await api.createTask({
      title: t,
      parent_task_id: parent.id,
      project_id: parent.project_id,
      priority,
      difficulty
    });
    setTitle('');
    await load();
  }

  async function toggle(task: Task) {
    await api.updateTask(task.id, {
      status: task.status === 'done' ? 'pending' : 'done'
    });
    await load();
  }

  async function remove(task: Task) {
    await api.deleteTask(task.id);
    await load();
  }

  const sorted = sortByPriority(subtasks);
  const total = sorted.length;
  const done = sorted.filter((s) => s.status === 'done').length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase text-muted flex items-center gap-1.5">
          <ListTree size={12} /> Подзадачи · {done}/{total}
        </div>
        {total > 0 && (
          <span className="text-[11px] text-muted timer-font">{percent}%</span>
        )}
      </div>

      {total > 0 && (
        <div className="bg-surface2 rounded-full h-1.5 overflow-hidden mb-3">
          <div
            className="bg-accent h-full transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
        className="flex gap-1 mb-3"
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="+ Новая подзадача"
          className="flex-1 h-8 px-2 rounded-md border border-border bg-surface text-xs focus:outline-none focus:border-accent"
        />
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as TaskPriority)}
          title={`Важность: ${PRIORITY_LABEL[priority]}`}
          className="h-8 px-1 rounded-md border border-border bg-surface text-xs"
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p === 'urgent' ? '🔥' : p === 'high' ? '⚠' : p === 'normal' ? '·' : '↓'}
            </option>
          ))}
        </select>
        <select
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value as TaskDifficulty)}
          className="h-8 px-1 rounded-md border border-border bg-surface text-xs"
        >
          {DIFFICULTIES.map((d) => (
            <option key={d} value={d}>
              {DIFFICULTY_ICON[d]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={!title.trim()}
          className="bg-accent text-white w-8 h-8 rounded-md disabled:opacity-40 flex items-center justify-center"
        >
          <Plus size={14} />
        </button>
      </form>

      {total === 0 ? (
        <div className="text-xs text-faint text-center py-2">
          Разбей задачу на шаги — добавь подзадачи сверху ↑
        </div>
      ) : (
        <div className="space-y-1">
          {sorted.map((st) => (
            <div
              key={st.id}
              className="flex items-center gap-2 px-2 py-1.5 hover:bg-surface2 rounded-md text-sm group cursor-pointer"
              onClick={() => onOpenTask?.(st.id)}
            >
              <input
                type="checkbox"
                checked={st.status === 'done'}
                onClick={(e) => e.stopPropagation()}
                onChange={() => toggle(st)}
              />
              <span
                className={
                  st.status === 'done' ? 'line-through text-muted flex-1' : 'flex-1'
                }
              >
                {st.title}
              </span>
              <DifficultyBadge difficulty={st.difficulty ?? 'medium'} />
              <PriorityBadge priority={st.priority} />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void remove(st);
                }}
                className="text-faint hover:text-danger opacity-0 group-hover:opacity-100"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

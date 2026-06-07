import { useEffect, useState } from 'react';
import { Plus, Trash2, Archive, ArchiveRestore } from 'lucide-react';
import { api } from '../api';
import type { Project, Task } from '@swit/shared';
import { PROJECT_PALETTE, PROJECT_ICONS } from '../lib/palette';
import { PRIORITIES, PRIORITY_LABEL, sortByPriority } from '../lib/priority';
import Modal from '../components/Modal';
import ProjectBadge from '../components/ProjectBadge';
import PriorityBadge from '../components/PriorityBadge';

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selected, setSelected] = useState<Project | null>(null);
  const [editing, setEditing] = useState<Project | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void reload();
  }, []);

  async function reload() {
    const [ps, ts] = await Promise.all([api.listProjects(), api.listTasks()]);
    setProjects(ps);
    setTasks(ts);
    if (selected) {
      const updated = ps.find((p) => p.id === selected.id);
      setSelected(updated ?? null);
    }
  }

  const active = projects.filter((p) => !p.archived);
  const archived = projects.filter((p) => p.archived);

  return (
    <div className="p-6 flex gap-6 max-w-[1300px]">
      <div className="w-[280px] shrink-0 space-y-2">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl font-semibold">Проекты</h1>
          <button
            onClick={() => setCreating(true)}
            className="bg-accent text-white w-8 h-8 rounded-md hover:bg-accent-hover flex items-center justify-center"
          >
            <Plus size={16} />
          </button>
        </div>

        {active.map((p) => (
          <ProjectCard
            key={p.id}
            project={p}
            tasks={tasks.filter((t) => t.project_id === p.id)}
            selected={selected?.id === p.id}
            onClick={() => setSelected(p)}
          />
        ))}

        {archived.length > 0 && (
          <>
            <div className="text-xs uppercase text-muted mt-6 mb-2">Архив</div>
            {archived.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                tasks={tasks.filter((t) => t.project_id === p.id)}
                selected={selected?.id === p.id}
                onClick={() => setSelected(p)}
              />
            ))}
          </>
        )}

        {projects.length === 0 && (
          <div className="text-sm text-muted">Создай первый проект</div>
        )}
      </div>

      <div className="flex-1">
        {selected ? (
          <ProjectDetail
            project={selected}
            tasks={tasks.filter((t) => t.project_id === selected.id)}
            onEdit={() => setEditing(selected)}
            onRefresh={reload}
          />
        ) : (
          <div className="text-muted text-sm p-10 text-center bg-surface rounded-lg shadow-sm">
            Выбери проект слева
          </div>
        )}
      </div>

      <ProjectFormModal
        open={creating || editing !== null}
        project={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={async (p) => {
          setCreating(false);
          setEditing(null);
          await reload();
          setSelected(p);
        }}
      />
    </div>
  );
}

function ProjectCard({
  project,
  tasks,
  selected,
  onClick
}: {
  project: Project;
  tasks: Task[];
  selected: boolean;
  onClick: () => void;
}) {
  const open = tasks.filter((t) => t.status !== 'done').length;
  const done = tasks.filter((t) => t.status === 'done').length;
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-lg p-3 border transition ${
        selected ? 'border-accent bg-accent-light' : 'border-border bg-surface hover:bg-surface2'
      } ${project.archived ? 'opacity-60' : ''}`}
    >
      <div className="flex items-center gap-2">
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center text-sm"
          style={{ background: project.color + '20' }}
        >
          {project.icon ?? '📁'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{project.name}</div>
          <div className="text-xs text-muted">
            {open} активно · {done} готово
          </div>
        </div>
      </div>
    </button>
  );
}

function ProjectDetail({
  project,
  tasks,
  onEdit,
  onRefresh
}: {
  project: Project;
  tasks: Task[];
  onEdit: () => void;
  onRefresh: () => Promise<void>;
}) {
  async function toggleArchive() {
    await api.updateProject(project.id, { archived: project.archived ? 0 : 1 });
    await onRefresh();
  }
  async function remove() {
    if (!confirm(`Удалить проект «${project.name}»? Задачи останутся, но без проекта.`)) return;
    // sever foreign keys client-side: clear project_id on tasks
    for (const t of tasks) {
      await api.updateTask(t.id, { project_id: null });
    }
    await api.deleteProject(project.id);
    await onRefresh();
  }

  return (
    <div className="space-y-4">
      <div className="bg-surface rounded-lg shadow-sm p-6">
        <div className="flex items-start gap-4">
          <div
            className="w-14 h-14 rounded-lg flex items-center justify-center text-2xl"
            style={{ background: project.color + '20' }}
          >
            {project.icon ?? '📁'}
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-semibold">{project.name}</h2>
            {project.description && (
              <p className="text-muted text-sm mt-1">{project.description}</p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onEdit}
              className="px-3 py-1.5 rounded-md text-sm border border-border hover:bg-surface2"
            >
              Редактировать
            </button>
            <button
              onClick={toggleArchive}
              className="px-3 py-1.5 rounded-md text-sm border border-border hover:bg-surface2 flex items-center gap-1.5"
            >
              {project.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
              {project.archived ? 'Вернуть' : 'В архив'}
            </button>
            <button
              onClick={remove}
              className="px-3 py-1.5 rounded-md text-sm border border-border text-danger hover:bg-surface2"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>

      <ProjectTasks project={project} tasks={tasks} onRefresh={onRefresh} />
    </div>
  );
}

function ProjectTasks({
  project,
  tasks,
  onRefresh
}: {
  project: Project;
  tasks: Task[];
  onRefresh: () => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');

  async function add() {
    if (!title.trim()) return;
    await api.createTask({ title, project_id: project.id, priority });
    setTitle('');
    await onRefresh();
  }

  const open = sortByPriority(tasks.filter((t) => t.status !== 'done'));
  const done = tasks.filter((t) => t.status === 'done');

  return (
    <div className="bg-surface rounded-lg shadow-sm p-6">
      <div className="flex items-center gap-2 mb-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Новая задача в проект..."
          className="flex-1 h-9 px-3 rounded-md border border-border bg-surface text-sm focus:outline-none focus:border-accent"
        />
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as typeof priority)}
          className="h-9 px-2 rounded-md border border-border bg-surface text-sm"
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </select>
        <button
          onClick={add}
          className="bg-accent text-white px-4 h-9 rounded-md text-sm hover:bg-accent-hover"
        >
          Добавить
        </button>
      </div>

      <div className="space-y-1">
        {open.map((t) => (
          <TaskRow key={t.id} task={t} onChange={onRefresh} />
        ))}
        {open.length === 0 && <div className="text-sm text-muted py-2">Нет активных задач</div>}
      </div>

      {done.length > 0 && (
        <>
          <div className="text-xs uppercase text-muted mt-6 mb-2">Готово · {done.length}</div>
          <div className="space-y-1">
            {done.map((t) => (
              <TaskRow key={t.id} task={t} onChange={onRefresh} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TaskRow({ task, onChange }: { task: Task; onChange: () => Promise<void> }) {
  async function toggle() {
    await api.updateTask(task.id, {
      status: task.status === 'done' ? 'pending' : 'done'
    });
    await onChange();
  }
  async function setPriority(p: typeof task.priority) {
    await api.updateTask(task.id, { priority: p });
    await onChange();
  }
  async function remove() {
    await api.deleteTask(task.id);
    await onChange();
  }
  return (
    <div className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-surface2 text-sm group">
      <input type="checkbox" checked={task.status === 'done'} onChange={toggle} />
      <span className={task.status === 'done' ? 'line-through text-muted flex-1' : 'flex-1'}>
        {task.title}
      </span>
      <PriorityBadge priority={task.priority} />
      <select
        value={task.priority}
        onChange={(e) => setPriority(e.target.value as typeof task.priority)}
        className="text-xs h-7 px-1 rounded border border-border bg-surface opacity-0 group-hover:opacity-100"
      >
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {PRIORITY_LABEL[p]}
          </option>
        ))}
      </select>
      <button
        onClick={remove}
        className="text-faint hover:text-danger opacity-0 group-hover:opacity-100"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function ProjectFormModal({
  open,
  project,
  onClose,
  onSaved
}: {
  open: boolean;
  project: Project | null;
  onClose: () => void;
  onSaved: (p: Project) => void;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(PROJECT_PALETTE[0]);
  const [icon, setIcon] = useState<string>(PROJECT_ICONS[0]);
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (open) {
      setName(project?.name ?? '');
      setColor(project?.color ?? PROJECT_PALETTE[0]);
      setIcon(project?.icon ?? PROJECT_ICONS[0]);
      setDescription(project?.description ?? '');
    }
  }, [open, project]);

  async function save() {
    if (!name.trim()) return;
    const saved = project
      ? await api.updateProject(project.id, { name, color, icon, description })
      : await api.createProject({ name, color, icon, description });
    onSaved(saved);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={project ? 'Редактировать проект' : 'Новый проект'}
      footer={
        <>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-sm border border-border"
          >
            Отмена
          </button>
          <button
            onClick={save}
            className="px-4 py-1.5 rounded-md text-sm bg-accent text-white hover:bg-accent-hover"
          >
            Сохранить
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="text-xs uppercase text-muted">Название</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            className="w-full mt-1 h-10 px-3 rounded-md border border-border bg-surface text-sm focus:outline-none focus:border-accent"
            placeholder="Например, Работа"
          />
        </div>

        <div>
          <label className="text-xs uppercase text-muted">Цвет</label>
          <div className="flex flex-wrap gap-2 mt-2">
            {PROJECT_PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-md ring-offset-2 ring-offset-surface ${
                  color === c ? 'ring-2 ring-ink' : ''
                }`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs uppercase text-muted">Иконка</label>
          <div className="flex flex-wrap gap-2 mt-2">
            {PROJECT_ICONS.map((emo) => (
              <button
                key={emo}
                onClick={() => setIcon(emo)}
                className={`w-8 h-8 rounded-md border text-lg ${
                  icon === emo ? 'border-accent bg-accent-light' : 'border-border'
                }`}
              >
                {emo}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs uppercase text-muted">Описание</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full mt-1 p-3 rounded-md border border-border bg-surface text-sm focus:outline-none focus:border-accent resize-none"
            placeholder="Опционально"
          />
        </div>

        <div className="pt-2 border-t border-border">
          <div className="text-xs uppercase text-muted mb-2">Превью</div>
          <ProjectBadge
            project={{
              id: '',
              name: name || 'Новый проект',
              color,
              icon,
              description: null,
              archived: 0,
              sort_order: 0,
              created_at: '',
              updated_at: ''
            }}
            size="md"
          />
        </div>
      </div>
    </Modal>
  );
}

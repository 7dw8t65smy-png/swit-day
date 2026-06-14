import { useEffect, useMemo, useState } from 'react';
import { Pin, PinOff, Trash2, Plus, FileText } from 'lucide-react';
import { api } from '../api';
import type { Note, NoteType, Project, Task } from '@swit/shared';
import { useRealtimeRefetch } from '../hooks/useRealtimeRefetch';
import ProjectBadge from '../components/ProjectBadge';

export default function Notes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [type, setType] = useState<NoteType>('quick');
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState<string>('');
  const [selectedFull, setSelectedFull] = useState<Note | null>(null);

  useEffect(() => {
    void reload();
  }, []);
  useRealtimeRefetch(() => void reload());

  async function reload() {
    const [ns, ps, ts] = await Promise.all([
      api.listNotes(),
      api.listProjects(),
      api.listTasks()
    ]);
    setNotes(ns);
    setProjects(ps);
    setTasks(ts);
    if (selectedFull) {
      const upd = ns.find((n) => n.id === selectedFull.id);
      setSelectedFull(upd ?? null);
    }
  }

  const projectById = useMemo(
    () => new Map(projects.map((p) => [p.id, p] as const)),
    [projects]
  );

  const filtered = useMemo(() => {
    return notes.filter((n) => {
      if (n.type !== type) return false;
      if (projectFilter && n.project_id !== projectFilter) return false;
      if (search && !n.content.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [notes, type, search, projectFilter]);

  async function addQuick() {
    // Создаём пустую — карточка сама откроется на ввод (см. QuickNoteCard).
    // Пустую так и не заполненную заметку при потере фокуса выбросим.
    const n = await api.createNote({
      content: '',
      type: 'quick',
      project_id: projectFilter || null
    });
    setNotes((cur) => [n, ...cur]);
  }

  async function addFull() {
    const n = await api.createNote({
      content: '# Заголовок\n\nТекст...',
      type: 'full',
      project_id: projectFilter || null
    });
    setNotes((cur) => [n, ...cur]);
    setSelectedFull(n);
  }

  return (
    <div className="p-6 max-w-[1400px]">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <h1 className="text-2xl font-semibold mr-4">Заметки</h1>
        <div className="flex gap-1 bg-surface2 rounded-md p-1">
          {(['quick', 'full'] as NoteType[]).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`px-3 py-1 rounded text-sm ${
                type === t ? 'bg-surface shadow-sm' : 'text-muted'
              }`}
            >
              {t === 'quick' ? 'Быстрые' : 'Полные'}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск..."
          className="h-9 px-3 rounded-md border border-border bg-surface text-sm w-48"
        />
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="h-9 px-2 rounded-md border border-border bg-surface text-sm"
        >
          <option value="">Все проекты</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.icon ?? ''} {p.name}
            </option>
          ))}
        </select>
        <button
          onClick={type === 'quick' ? addQuick : addFull}
          className="ml-auto bg-accent text-white px-3 py-1.5 rounded-md text-sm hover:bg-accent-hover flex items-center gap-1.5"
        >
          <Plus size={14} /> Новая
        </button>
      </div>

      {type === 'quick' ? (
        <QuickNotesGrid
          notes={filtered}
          projects={projectById}
          tasks={tasks}
          onChange={reload}
        />
      ) : (
        <FullNotesView
          notes={filtered}
          selected={selectedFull}
          onSelect={setSelectedFull}
          projects={projects}
          tasks={tasks}
          projectById={projectById}
          onChange={reload}
        />
      )}
    </div>
  );
}

function QuickNotesGrid({
  notes,
  projects,
  tasks,
  onChange
}: {
  notes: Note[];
  projects: Map<string, Project>;
  tasks: Task[];
  onChange: () => Promise<void>;
}) {
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t] as const)), [tasks]);
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {notes.map((n) => (
        <QuickNoteCard
          key={n.id}
          note={n}
          project={n.project_id ? projects.get(n.project_id) ?? null : null}
          task={n.task_id ? taskById.get(n.task_id) ?? null : null}
          onChange={onChange}
        />
      ))}
      {notes.length === 0 && (
        <div className="text-sm text-muted col-span-full p-10 text-center">Пусто</div>
      )}
    </div>
  );
}

function QuickNoteCard({
  note,
  project,
  task,
  onChange
}: {
  note: Note;
  project: Project | null;
  task: Task | null;
  onChange: () => Promise<void>;
}) {
  const [text, setText] = useState(note.content);
  // Новая (пустая) заметка сразу открывается на ввод.
  const [editing, setEditing] = useState(note.content === '');

  // Пересинхронизируем локальный текст с заметкой, когда не редактируем
  // (после reload/realtime контент мог измениться извне).
  useEffect(() => {
    if (!editing) setText(note.content);
  }, [note.content, editing]);

  async function save() {
    const trimmed = text.trim();
    setEditing(false);
    if (trimmed === '') {
      if (note.content === '') {
        // Новая пустая заметка — не оставляем «призрак».
        await api.deleteNote(note.id);
        await onChange();
      } else {
        // Существующую не затираем — откатываем к сохранённому.
        setText(note.content);
      }
      return;
    }
    if (text !== note.content) {
      await api.updateNote(note.id, { content: text });
      await onChange();
    }
  }
  async function togglePin() {
    await api.updateNote(note.id, { pinned: note.pinned ? 0 : 1 });
    await onChange();
  }
  async function remove() {
    await api.deleteNote(note.id);
    await onChange();
  }

  return (
    <div className="bg-surface rounded-lg shadow-sm p-4 group relative">
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
        <button onClick={togglePin} className="text-faint hover:text-accent">
          {note.pinned ? <Pin size={14} fill="currentColor" /> : <PinOff size={14} />}
        </button>
        <button onClick={remove} className="text-faint hover:text-danger">
          <Trash2 size={14} />
        </button>
      </div>
      <div className="text-[11px] text-muted mb-1">{note.created_at.slice(0, 16).replace('T', ' ')}</div>
      {editing ? (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={save}
          autoFocus
          rows={4}
          placeholder="Текст заметки…"
          className="w-full text-sm bg-transparent resize-none focus:outline-none placeholder:text-muted/50"
        />
      ) : (
        <div
          onClick={() => setEditing(true)}
          className="text-sm whitespace-pre-wrap cursor-text min-h-[60px]"
        >
          {note.content || <span className="text-muted/50">Пустая заметка…</span>}
        </div>
      )}
      {(project || task) && (
        <div className="flex items-center gap-1.5 mt-3 flex-wrap">
          {project && <ProjectBadge project={project} />}
          {task && (
            <span className="text-[11px] text-muted bg-surface2 rounded px-2 py-0.5">
              → {task.title.slice(0, 30)}
            </span>
          )}
        </div>
      )}
      {note.pinned ? (
        <Pin size={12} className="absolute top-2 left-2 text-accent" fill="currentColor" />
      ) : null}
    </div>
  );
}

function FullNotesView({
  notes,
  selected,
  onSelect,
  projects,
  tasks,
  projectById,
  onChange
}: {
  notes: Note[];
  selected: Note | null;
  onSelect: (n: Note | null) => void;
  projects: Project[];
  tasks: Task[];
  projectById: Map<string, Project>;
  onChange: () => Promise<void>;
}) {
  const [content, setContent] = useState('');
  const [projectId, setProjectId] = useState<string>('');
  const [taskId, setTaskId] = useState<string>('');

  useEffect(() => {
    if (selected) {
      setContent(selected.content);
      setProjectId(selected.project_id ?? '');
      setTaskId(selected.task_id ?? '');
    }
  }, [selected?.id]);

  async function saveContent() {
    if (!selected) return;
    if (content !== selected.content) {
      await api.updateNote(selected.id, { content });
      await onChange();
    }
  }
  async function saveLinks(b: Partial<Note>) {
    if (!selected) return;
    await api.updateNote(selected.id, b);
    await onChange();
  }
  async function remove() {
    if (!selected) return;
    if (!confirm('Удалить заметку?')) return;
    await api.deleteNote(selected.id);
    onSelect(null);
    await onChange();
  }

  return (
    <div className="grid grid-cols-[280px_1fr] gap-4 h-[calc(100vh-160px)]">
      <aside className="bg-surface rounded-lg shadow-sm overflow-y-auto">
        {notes.length === 0 && (
          <div className="text-sm text-muted p-4 text-center">Пусто</div>
        )}
        {notes.map((n) => (
          <button
            key={n.id}
            onClick={() => onSelect(n)}
            className={`w-full text-left p-3 border-b border-border hover:bg-surface2 ${
              selected?.id === n.id ? 'bg-accent-light' : ''
            }`}
          >
            <div className="flex items-center gap-1.5">
              <FileText size={12} className="text-muted" />
              <div className="text-sm font-medium truncate flex-1">
                {firstLine(n.content) || 'Без названия'}
              </div>
              {n.pinned ? <Pin size={11} className="text-accent" fill="currentColor" /> : null}
            </div>
            <div className="text-[11px] text-muted mt-0.5">
              {n.updated_at.slice(0, 10)}
              {n.project_id && projectById.get(n.project_id) && (
                <span> · {projectById.get(n.project_id)!.name}</span>
              )}
            </div>
          </button>
        ))}
      </aside>

      {selected ? (
        <div className="bg-surface rounded-lg shadow-sm flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
            <select
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                void saveLinks({ project_id: e.target.value || null });
              }}
              className="h-8 px-2 rounded-md border border-border bg-surface text-xs"
            >
              <option value="">Без проекта</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.icon ?? ''} {p.name}
                </option>
              ))}
            </select>
            <select
              value={taskId}
              onChange={(e) => {
                setTaskId(e.target.value);
                void saveLinks({ task_id: e.target.value || null });
              }}
              className="h-8 px-2 rounded-md border border-border bg-surface text-xs max-w-[200px]"
            >
              <option value="">Без задачи</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title.slice(0, 40)}
                </option>
              ))}
            </select>
            <button
              onClick={() => saveLinks({ pinned: selected.pinned ? 0 : 1 })}
              className="ml-auto text-faint hover:text-accent"
            >
              {selected.pinned ? <Pin size={14} fill="currentColor" /> : <PinOff size={14} />}
            </button>
            <button onClick={remove} className="text-faint hover:text-danger">
              <Trash2 size={14} />
            </button>
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onBlur={saveContent}
            className="flex-1 p-4 text-sm font-mono bg-transparent focus:outline-none resize-none"
          />
        </div>
      ) : (
        <div className="bg-surface rounded-lg shadow-sm flex items-center justify-center text-sm text-muted">
          Выбери заметку слева или создай новую
        </div>
      )}
    </div>
  );
}

function firstLine(s: string): string {
  return s.replace(/^#+\s*/, '').split('\n')[0].slice(0, 50);
}

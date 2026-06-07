import { useEffect, useMemo, useState } from 'react';
import { X, Trash2, Play, Square, Pin, PinOff, Calendar as CalIcon, Clock } from 'lucide-react';
import type { Note, Project, Task, TaskDifficulty, TaskPriority, TaskTimeLog } from '@swit/shared';
import { api } from '../api';
import { PRIORITIES, PRIORITY_LABEL } from '../lib/priority';
import { DIFFICULTIES, DIFFICULTY_ICON, DIFFICULTY_LABEL } from '../lib/difficulty';
import { fmtHM } from '../lib/format';
import Subtasks from './Subtasks';

interface Props {
  task: Task | null;
  projects: Project[];
  onClose: () => void;
  onChanged: () => Promise<void>;
  /** Открыть другую задачу в этом же drawer (для подзадач) */
  onOpenTask?: (id: string) => void;
}

export default function TaskDrawer({ task, projects, onClose, onChanged, onOpenTask }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState<string>('');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [difficulty, setDifficulty] = useState<TaskDifficulty>('medium');
  const [dueDate, setDueDate] = useState<string>('');
  const [dueTime, setDueTime] = useState<string>('');
  const [estimated, setEstimated] = useState<string>('');
  const [notes, setNotes] = useState<Note[]>([]);
  const [logs, setLogs] = useState<TaskTimeLog[]>([]);
  const [activeLog, setActiveLog] = useState<TaskTimeLog | null>(null);
  const [newNote, setNewNote] = useState('');
  const [, force] = useState(0);

  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setDescription(task.description ?? '');
    setProjectId(task.project_id ?? '');
    setPriority(task.priority);
    setDifficulty(task.difficulty ?? 'medium');
    setDueDate(task.due_date ?? '');
    setDueTime(task.due_time ?? '');
    setEstimated(task.estimated_min ? String(task.estimated_min) : '');
    void loadRelated(task.id);
  }, [task?.id]);

  useEffect(() => {
    if (!activeLog) return undefined;
    const id = window.setInterval(() => force((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, [activeLog?.id]);

  useEffect(() => {
    if (!task) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [task, onClose]);

  async function loadRelated(taskId: string) {
    const [allNotes, all, active] = await Promise.all([
      api.listNotes(),
      api.timeLogs({ task_id: taskId }),
      api.activeTimeLog()
    ]);
    setNotes(allNotes.filter((n) => n.task_id === taskId));
    setLogs(all);
    setActiveLog(active?.task_id === taskId ? active : null);
  }

  async function patch(b: Partial<Task>) {
    if (!task) return;
    const updated = await api.updateTask(task.id, b);
    await onChanged();
  }

  async function saveTitle() {
    if (!task) return;
    if (title.trim() && title !== task.title) await patch({ title });
  }
  async function saveDescription() {
    if (!task) return;
    if (description !== (task.description ?? '')) await patch({ description: description || null });
  }
  async function saveDue(d: string, t: string) {
    await patch({ due_date: d || null, due_time: t || null });
  }
  async function saveEstimated(v: string) {
    await patch({ estimated_min: v ? Number(v) : null });
  }

  async function startTimer() {
    if (!task) return;
    const log = await api.startTimeLog(task.id);
    setActiveLog(log);
    await loadRelated(task.id);
  }
  async function stopTimer() {
    await api.stopTimeLog();
    setActiveLog(null);
    if (task) await loadRelated(task.id);
  }

  async function addNote() {
    if (!task || !newNote.trim()) return;
    const n = await api.createNote({
      content: newNote,
      type: 'quick',
      task_id: task.id,
      project_id: task.project_id
    });
    setNotes([n, ...notes]);
    setNewNote('');
  }

  async function togglePin(noteId: string, pinned: number) {
    const upd = await api.updateNote(noteId, { pinned: pinned ? 0 : 1 });
    setNotes((cur) => cur.map((n) => (n.id === noteId ? upd : n)));
  }

  async function removeNote(noteId: string) {
    await api.deleteNote(noteId);
    setNotes((cur) => cur.filter((n) => n.id !== noteId));
  }

  async function remove() {
    if (!task) return;
    if (!confirm('Удалить задачу? Заметки останутся.')) return;
    for (const n of notes) await api.updateNote(n.id, { task_id: null });
    if (activeLog?.task_id === task.id) await api.stopTimeLog();
    const taskId = task.id;
    await api.deleteTask(taskId);
    onClose();
    await onChanged();
  }

  const totalTime = useMemo(() => {
    const closed = logs.filter((l) => l.ended_at).reduce((a, l) => a + (l.duration_s ?? 0), 0);
    const live = activeLog
      ? Math.floor((Date.now() - new Date(activeLog.started_at).getTime()) / 1000)
      : 0;
    return closed + live;
  }, [logs, activeLog, force]);

  if (!task) return null;

  const project = projects.find((p) => p.id === projectId) ?? null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20" />
      <aside
        className="relative bg-surface w-[520px] h-full shadow-lg overflow-y-auto animate-in slide-in-from-right"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-surface border-b border-border px-5 py-3 flex items-center justify-between z-10">
          <div className="text-xs uppercase text-muted">Задача</div>
          <div className="flex items-center gap-1">
            <button
              onClick={remove}
              className="text-faint hover:text-danger p-1.5 rounded hover:bg-surface2"
            >
              <Trash2 size={16} />
            </button>
            <button
              onClick={onClose}
              className="text-faint hover:text-ink p-1.5 rounded hover:bg-surface2"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={task.status === 'done'}
              onChange={() =>
                patch({ status: task.status === 'done' ? 'pending' : 'done' })
              }
              className="mt-2 w-4 h-4"
            />
            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveTitle}
              rows={1}
              className={`flex-1 text-xl font-semibold bg-transparent border-none focus:outline-none resize-none ${
                task.status === 'done' ? 'line-through text-muted' : ''
              }`}
            />
          </div>

          {/* Meta grid */}
          <div className="grid grid-cols-[100px_1fr] gap-y-3 gap-x-3 text-sm items-center">
            <div className="text-xs uppercase text-muted">Проект</div>
            <select
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                void patch({ project_id: e.target.value || null });
              }}
              className="h-9 px-2 rounded-md border border-border bg-surface text-sm w-full"
            >
              <option value="">Без проекта</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.icon ?? ''} {p.name}
                </option>
              ))}
            </select>

            <div className="text-xs uppercase text-muted">Приоритет</div>
            <select
              value={priority}
              onChange={(e) => {
                const p = e.target.value as TaskPriority;
                setPriority(p);
                void patch({ priority: p });
              }}
              className="h-9 px-2 rounded-md border border-border bg-surface text-sm w-full"
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>

            <div className="text-xs uppercase text-muted">Сложность</div>
            <div className="flex gap-1">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d}
                  onClick={() => {
                    setDifficulty(d);
                    void patch({ difficulty: d });
                  }}
                  className={`flex-1 h-9 rounded-md text-xs border transition ${
                    difficulty === d
                      ? 'border-accent bg-accent-light text-ink font-medium'
                      : 'border-border text-muted hover:bg-surface2'
                  }`}
                  title={DIFFICULTY_LABEL[d]}
                >
                  {DIFFICULTY_ICON[d]} {DIFFICULTY_LABEL[d]}
                </button>
              ))}
            </div>

            <div className="text-xs uppercase text-muted">Дедлайн</div>
            <div className="flex gap-2">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => {
                  setDueDate(e.target.value);
                  void saveDue(e.target.value, dueTime);
                }}
                className="h-9 px-2 rounded-md border border-border bg-surface text-sm flex-1"
              />
              <input
                type="time"
                value={dueTime}
                onChange={(e) => {
                  setDueTime(e.target.value);
                  void saveDue(dueDate, e.target.value);
                }}
                className="h-9 px-2 rounded-md border border-border bg-surface text-sm w-28"
              />
            </div>

            <div className="text-xs uppercase text-muted">Оценка, мин</div>
            <input
              type="number"
              value={estimated}
              onChange={(e) => setEstimated(e.target.value)}
              onBlur={() => saveEstimated(estimated)}
              placeholder="0"
              className="h-9 px-3 rounded-md border border-border bg-surface text-sm w-full"
            />
          </div>

          {/* Description */}
          <div>
            <div className="text-xs uppercase text-muted mb-1.5">Описание</div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={saveDescription}
              rows={4}
              placeholder="Что нужно сделать, контекст, ссылки..."
              className="w-full p-3 rounded-md border border-border bg-surface text-sm focus:outline-none focus:border-accent resize-none"
            />
          </div>

          {/* Time tracking */}
          <div className="bg-surface2 rounded-lg p-3 flex items-center gap-3">
            <Clock size={16} className="text-muted" />
            <div className="flex-1">
              <div className="text-xs uppercase text-muted">Затрачено</div>
              <div className="text-lg font-semibold timer-font">{fmtHM(totalTime) || '0м'}</div>
            </div>
            {activeLog ? (
              <button
                onClick={stopTimer}
                className="bg-pause text-white px-3 py-2 rounded-md text-sm flex items-center gap-1.5"
                style={{ background: 'var(--color-pause)' }}
              >
                <Square size={12} /> Стоп
              </button>
            ) : (
              <button
                onClick={startTimer}
                className="bg-accent text-white px-3 py-2 rounded-md text-sm flex items-center gap-1.5 hover:bg-accent-hover"
              >
                <Play size={12} /> Засечь время
              </button>
            )}
          </div>

          {/* Subtasks */}
          <Subtasks parent={task} onOpenTask={onOpenTask} />

          {/* Notes */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs uppercase text-muted">Заметки · {notes.length}</div>
            </div>
            <div className="flex gap-2 mb-3">
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void addNote();
                  }
                }}
                rows={2}
                placeholder="Заметка к задаче (⌘+Enter)"
                className="flex-1 p-2 rounded-md border border-border bg-surface text-sm focus:outline-none focus:border-accent resize-none"
              />
              <button
                onClick={addNote}
                className="bg-accent text-white px-3 rounded-md text-sm hover:bg-accent-hover"
              >
                Добавить
              </button>
            </div>
            <div className="space-y-2">
              {notes
                .sort((a, b) => Number(b.pinned) - Number(a.pinned))
                .map((n) => (
                  <div
                    key={n.id}
                    className="bg-surface2 rounded-md p-3 text-sm group relative"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className="text-[10px] text-muted">
                        {n.created_at.slice(0, 16).replace('T', ' ')}
                      </div>
                      {n.pinned ? (
                        <Pin size={10} className="text-accent" fill="currentColor" />
                      ) : null}
                      <div className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100">
                        <button
                          onClick={() => togglePin(n.id, n.pinned)}
                          className="text-faint hover:text-accent"
                        >
                          {n.pinned ? <PinOff size={12} /> : <Pin size={12} />}
                        </button>
                        <button
                          onClick={() => removeNote(n.id)}
                          className="text-faint hover:text-danger"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                    <div className="whitespace-pre-wrap">{n.content}</div>
                  </div>
                ))}
              {notes.length === 0 && (
                <div className="text-xs text-faint text-center py-3">
                  Пока нет заметок к этой задаче
                </div>
              )}
            </div>
          </div>

          {/* Time logs */}
          {logs.length > 0 && (
            <div>
              <div className="text-xs uppercase text-muted mb-2">Сессии · {logs.length}</div>
              <div className="space-y-1">
                {logs.slice(0, 5).map((l) => (
                  <div
                    key={l.id}
                    className="flex items-center justify-between text-xs text-muted px-2 py-1"
                  >
                    <span>{new Date(l.started_at).toLocaleString('ru-RU')}</span>
                    <span className="timer-font">
                      {l.ended_at ? fmtHM(l.duration_s ?? 0) : '… идёт'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

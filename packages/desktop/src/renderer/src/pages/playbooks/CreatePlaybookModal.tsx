import { useEffect, useState } from 'react';
import { api } from '../../api';
import type { Playbook, Project } from '@swit/shared';
import Modal from '../../components/Modal';
import { PROJECT_ICONS } from '../../lib/palette';

export function CreatePlaybookModal({
  open,
  projects,
  onClose,
  onCreated
}: {
  open: boolean;
  projects: Project[];
  onClose: () => void;
  onCreated: (pb: Playbook) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState('');
  const [icon, setIcon] = useState('📋');

  useEffect(() => {
    if (open) {
      setTitle('');
      setDescription('');
      setProjectId('');
      setIcon('📋');
    }
  }, [open]);

  async function create() {
    if (!title.trim()) return;
    const pb = await api.createPlaybook({
      title,
      description: description || null,
      project_id: projectId || null,
      icon
    });
    await onCreated(pb);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Новый регламент"
      footer={
        <>
          <button onClick={onClose} className="px-3 py-1.5 rounded-md text-sm border border-border">
            Отмена
          </button>
          <button
            onClick={create}
            disabled={!title.trim()}
            className="px-4 py-1.5 rounded-md text-sm bg-accent text-white hover:bg-accent-hover disabled:opacity-40"
          >
            Создать
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex gap-2 items-start">
          <select
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            className="h-10 px-2 rounded-md border border-border bg-surface text-lg"
          >
            {['📋', '📝', '🚀', '💼', '🎓', '🛠', '📚', '🎯', ...PROJECT_ICONS].map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            placeholder="Например, «Наём нового чаттера»"
            className="flex-1 h-10 px-3 rounded-md border border-border bg-surface text-sm"
          />
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Короткое описание (опционально)"
          className="w-full p-3 rounded-md border border-border bg-surface text-sm resize-none"
        />
        <div>
          <label className="text-xs uppercase text-muted">Привязать к проекту</label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full mt-1 h-10 px-2 rounded-md border border-border bg-surface text-sm"
          >
            <option value="">🌐 Глобальный (без проекта)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.icon ?? ''} {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="text-xs text-muted">
          После создания добавь шаги — каждый с описанием.
        </div>
      </div>
    </Modal>
  );
}

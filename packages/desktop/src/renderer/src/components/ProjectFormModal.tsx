import { useEffect, useState } from 'react';
import type { Project } from '@swit/shared';
import Modal from './Modal';
import ProjectBadge from './ProjectBadge';
import { PROJECT_ICONS, PROJECT_PALETTE } from '../lib/palette';
import { api } from '../api';

interface Props {
  open: boolean;
  project: Project | null; // null = create
  onClose: () => void;
  onSaved: (p: Project) => Promise<void> | void;
  onDelete?: (id: string) => Promise<void> | void;
}

export default function ProjectFormModal({ open, project, onClose, onSaved, onDelete }: Props) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(PROJECT_PALETTE[0]);
  const [icon, setIcon] = useState<string>(PROJECT_ICONS[0]);
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(project?.name ?? '');
    setColor(project?.color ?? PROJECT_PALETTE[0]);
    setIcon(project?.icon ?? PROJECT_ICONS[0]);
    setDescription(project?.description ?? '');
  }, [open, project]);

  async function save() {
    if (!name.trim()) return;
    const saved = project
      ? await api.updateProject(project.id, { name, color, icon, description })
      : await api.createProject({ name, color, icon, description });
    await onSaved(saved);
  }

  async function toggleArchive() {
    if (!project) return;
    const upd = await api.updateProject(project.id, { archived: project.archived ? 0 : 1 });
    await onSaved(upd);
  }

  async function remove() {
    if (!project || !onDelete) return;
    if (!confirm(`Удалить проект «${project.name}»? Задачи останутся, но без проекта.`)) return;
    await onDelete(project.id);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={project ? `Настройки проекта` : 'Новый проект'}
      footer={
        <>
          {project && onDelete && (
            <button
              onClick={remove}
              className="px-3 py-1.5 rounded-md text-sm text-danger border border-border mr-auto"
            >
              Удалить
            </button>
          )}
          {project && (
            <button
              onClick={toggleArchive}
              className="px-3 py-1.5 rounded-md text-sm border border-border"
            >
              {project.archived ? 'Вернуть из архива' : 'В архив'}
            </button>
          )}
          <button onClick={onClose} className="px-3 py-1.5 rounded-md text-sm border border-border">
            Отмена
          </button>
          <button
            onClick={save}
            disabled={!name.trim()}
            className="px-4 py-1.5 rounded-md text-sm bg-accent text-white hover:bg-accent-hover disabled:opacity-40"
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
            placeholder="Например, Работа"
            className="w-full mt-1 h-10 px-3 rounded-md border border-border bg-surface text-sm focus:outline-none focus:border-accent"
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
            className="w-full mt-1 p-3 rounded-md border border-border bg-surface text-sm resize-none focus:outline-none focus:border-accent"
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

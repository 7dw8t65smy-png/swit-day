import { useEffect, useState } from 'react';
import { Trash2, Archive, ArchiveRestore } from 'lucide-react';
import { api } from '../../api';
import type { PlaybookWithSteps, Project } from '@swit/shared';
import DocumentationBlock from '../../components/DocumentationBlock';
import { PROJECT_ICONS } from '../../lib/palette';
import { pluralizeSteps } from './helpers';
import { StepEditor } from './StepEditor';

export function PlaybookDetail({
  playbook,
  projects,
  onChanged
}: {
  playbook: PlaybookWithSteps;
  projects: Project[];
  onChanged: () => Promise<void>;
}): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(playbook.title);
  const [description, setDescription] = useState(playbook.description ?? '');
  const [projectId, setProjectId] = useState(playbook.project_id ?? '');
  const [icon, setIcon] = useState(playbook.icon ?? '📋');

  useEffect(() => {
    setTitle(playbook.title);
    setDescription(playbook.description ?? '');
    setProjectId(playbook.project_id ?? '');
    setIcon(playbook.icon ?? '📋');
  }, [playbook.id]);

  async function saveMeta() {
    await api.updatePlaybook(playbook.id, {
      title,
      description: description || null,
      project_id: projectId || null,
      icon
    });
    setEditing(false);
    await onChanged();
  }

  async function toggleArchive() {
    await api.updatePlaybook(playbook.id, { archived: playbook.archived ? 0 : 1 });
    await onChanged();
  }

  async function remove(): Promise<void> {
    if (!confirm(`Удалить регламент «${playbook.title}»?`)) return;
    await api.deletePlaybook(playbook.id);
    await onChanged();
  }

  return (
    <div className="space-y-4">
      <section className="bg-surface rounded-lg shadow-sm p-5">
        {editing ? (
          <div className="space-y-3">
            <div className="flex gap-2 items-start">
              <select
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                className="h-10 px-2 rounded-md border border-border bg-surface text-lg"
              >
                {['📋', ...PROJECT_ICONS].map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="flex-1 h-10 px-3 rounded-md border border-border bg-surface text-base font-medium"
              />
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Краткое описание регламента..."
              className="w-full p-3 rounded-md border border-border bg-surface text-sm resize-none"
            />
            <div className="grid grid-cols-[120px_1fr] gap-3 items-center">
              <div className="text-xs uppercase text-muted">Проект</div>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="h-10 px-2 rounded-md border border-border bg-surface text-sm"
              >
                <option value="">🌐 Глобальный (без проекта)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.icon ?? ''} {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditing(false)}
                className="px-3 py-1.5 rounded-md text-sm border border-border"
              >
                Отмена
              </button>
              <button
                onClick={saveMeta}
                className="px-4 py-1.5 rounded-md text-sm bg-accent text-white"
              >
                Сохранить
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-4">
            <div className="text-3xl">{playbook.icon ?? '📋'}</div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-semibold">{playbook.title}</h2>
              {playbook.description && (
                <p className="text-sm text-muted mt-1">{playbook.description}</p>
              )}
              <div className="text-xs text-muted mt-2">
                {playbook.project_id
                  ? `📁 ${projects.find((p) => p.id === playbook.project_id)?.name ?? '—'}`
                  : '🌐 Глобальный'}
                {' · '}
                {pluralizeSteps(playbook.steps.length)}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => setEditing(true)}
                className="px-3 py-2 rounded-md text-sm border border-border hover:bg-surface2"
              >
                Изменить
              </button>
              <button
                onClick={toggleArchive}
                className="px-3 py-2 rounded-md text-sm border border-border hover:bg-surface2"
                title={playbook.archived ? 'Вернуть из архива' : 'В архив'}
              >
                {playbook.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
              </button>
              <button
                onClick={remove}
                title="Удалить регламент"
                className="px-3 py-2 rounded-md text-sm border border-border hover:bg-red-50 hover:border-red-300 hover:text-red-500 transition"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        )}
      </section>

      <DocumentationBlock
        value={playbook.content}
        label="Документация"
        onSave={async (v) => {
          await api.updatePlaybook(playbook.id, { content: v });
          await onChanged();
        }}
      />

      <StepEditor playbook={playbook} onChanged={onChanged} />
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Trash2, ChevronRight, ChevronDown } from 'lucide-react';
import { api } from '../../api';
import type { PlaybookStep } from '@swit/shared';

export function StepRow({
  step,
  index,
  expanded,
  onToggle,
  onChanged
}: {
  step: PlaybookStep;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => Promise<void>;
}) {
  const [title, setTitle] = useState(step.title);
  const [description, setDescription] = useState(step.description ?? '');
  const titleRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  // Пересинхронизируем с сервером, когда поле НЕ в фокусе (правка шага могла
  // прилететь от другого участника по realtime). Иначе blur без ввода затрёт
  // чужую правку нашим старым значением.
  useEffect(() => {
    if (document.activeElement !== titleRef.current) setTitle(step.title);
  }, [step.title]);
  useEffect(() => {
    if (document.activeElement !== descRef.current) setDescription(step.description ?? '');
  }, [step.description]);

  async function saveTitle() {
    if (title !== step.title) {
      await api.updateStep(step.id, { title });
      await onChanged();
    }
  }
  async function saveDesc() {
    if (description !== (step.description ?? '')) {
      await api.updateStep(step.id, { description: description || null });
      await onChanged();
    }
  }
  async function remove() {
    if (!confirm('Удалить шаг?')) return;
    await api.deleteStep(step.id);
    await onChanged();
  }
  async function move(dir: -1 | 1) {
    await api.updateStep(step.id, { sort_order: step.sort_order + dir * 1.5 });
    await onChanged();
  }

  return (
    <div className="border border-border rounded-md group">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          onClick={onToggle}
          className="text-faint hover:text-ink shrink-0"
          title={expanded ? 'Свернуть' : 'Развернуть'}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <span className="text-xs text-muted timer-font w-5">{index + 1}.</span>
        <input
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          className="flex-1 text-sm bg-transparent focus:outline-none"
        />
        <div className="flex gap-1 opacity-0 group-hover:opacity-100">
          <button onClick={() => move(-1)} className="text-faint hover:text-ink text-xs px-1">
            ↑
          </button>
          <button onClick={() => move(1)} className="text-faint hover:text-ink text-xs px-1">
            ↓
          </button>
          <button onClick={remove} className="text-faint hover:text-danger">
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-border px-3 py-2">
          <textarea
            ref={descRef}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={saveDesc}
            rows={4}
            placeholder="Подробное описание шага, инструкции, ссылки..."
            className="w-full p-2 rounded-md border border-border bg-surface text-sm focus:outline-none focus:border-accent resize-none font-mono"
          />
        </div>
      )}
    </div>
  );
}

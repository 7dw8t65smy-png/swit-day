import { useState } from 'react';
import { api } from '../../api';
import type { PlaybookWithSteps } from '@swit/shared';
import { StepRow } from './StepRow';

export function StepEditor({
  playbook,
  onChanged
}: {
  playbook: PlaybookWithSteps;
  onChanged: () => Promise<void>;
}) {
  const [newStep, setNewStep] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  async function add() {
    if (!newStep.trim()) return;
    await api.addStep(playbook.id, { title: newStep });
    setNewStep('');
    await onChanged();
  }

  function toggle(id: string) {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section className="bg-surface rounded-lg shadow-sm p-5">
      <div className="text-sm font-medium mb-3">Шаги · {playbook.steps.length}</div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
        className="flex gap-2 mb-3"
      >
        <input
          value={newStep}
          onChange={(e) => setNewStep(e.target.value)}
          placeholder="+ Новый шаг (название)"
          className="flex-1 h-9 px-3 rounded-md border border-border bg-surface text-sm focus:outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={!newStep.trim()}
          className="bg-accent text-white px-4 h-9 rounded-md text-sm hover:bg-accent-hover disabled:opacity-40"
        >
          Добавить
        </button>
      </form>

      <div className="space-y-1">
        {playbook.steps.map((s, i) => (
          <StepRow
            key={s.id}
            step={s}
            index={i}
            expanded={expanded.has(s.id)}
            onToggle={() => toggle(s.id)}
            onChanged={onChanged}
          />
        ))}
        {playbook.steps.length === 0 && (
          <div className="text-sm text-muted text-center py-4">
            Добавь первый шаг сверху ↑
          </div>
        )}
      </div>
    </section>
  );
}

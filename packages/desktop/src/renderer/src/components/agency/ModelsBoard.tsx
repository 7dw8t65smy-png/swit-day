import { useState } from 'react';
import { Plus, Trash2, UserPlus, AlertTriangle } from 'lucide-react';
import { SHIFTS, SHIFT_LABELS } from '@swit/shared';
import type { AgencyShift } from '@swit/shared';
import { api } from '../../api';
import { useAgencyStore } from '../../lib/agency';

export default function ModelsBoard() {
  const agencyId = useAgencyStore((s) => s.selectedId);
  const models = useAgencyStore((s) => s.models);
  const chatters = useAgencyStore((s) => s.chatters);
  const assignments = useAgencyStore((s) => s.assignments);
  const reload = useAgencyStore((s) => s.reloadEntities);
  const [newName, setNewName] = useState('');

  if (!agencyId) return null;

  const activeChatters = chatters.filter((c) => c.active);

  function chatterFor(modelId: string, shift: AgencyShift): string | null {
    return assignments.find((a) => a.model_id === modelId && a.shift === shift)?.chatter_id ?? null;
  }

  async function addModel(): Promise<void> {
    const name = newName.trim();
    if (!name || !agencyId) return;
    await api.createAgencyModel({ agency_id: agencyId, name });
    setNewName('');
    await reload();
  }

  async function setSlot(modelId: string, shift: AgencyShift, chatterId: string | null): Promise<void> {
    if (!agencyId) return;
    await api.setAgencyAssignment({ agency_id: agencyId, model_id: modelId, shift, chatter_id: chatterId });
    await reload();
  }

  async function removeModel(id: string, name: string): Promise<void> {
    if (!confirm(`Удалить модель «${name}»? Её продажи также удалятся.`)) return;
    await api.deleteAgencyModel(id);
    await reload();
  }

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void addModel();
        }}
        className="flex gap-2 mb-4 max-w-md"
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="+ Новая модель (имя / аккаунт)"
          className="flex-1 h-9 px-3 rounded-md border border-border bg-surface text-sm focus:outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={!newName.trim()}
          className="bg-accent text-white px-3 h-9 rounded-md text-sm flex items-center gap-1 disabled:opacity-40"
        >
          <Plus size={15} /> Модель
        </button>
      </form>

      {models.length === 0 ? (
        <div className="text-sm text-faint border border-dashed border-border rounded-lg py-10 text-center">
          Пока нет моделей. Добавьте первую сверху ↑
        </div>
      ) : (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
          {models.map((m) => {
            const gaps = SHIFTS.filter((s) => !chatterFor(m.id, s)).length;
            return (
              <div key={m.id} className="rounded-xl border border-border bg-surface p-3 group">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-ink truncate">{m.name}</span>
                    {gaps > 0 && (
                      <span
                        title={`${gaps} смен без чаттера`}
                        className="flex items-center gap-0.5 text-[11px] text-amber-600 dark:text-amber-400"
                      >
                        <AlertTriangle size={12} /> {gaps}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => void removeModel(m.id, m.name)}
                    className="text-faint hover:text-danger opacity-0 group-hover:opacity-100"
                    title="Удалить модель"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="space-y-1.5">
                  {SHIFTS.map((shift) => {
                    const cid = chatterFor(m.id, shift);
                    const chatter = cid ? chatters.find((c) => c.id === cid) : null;
                    return (
                      <div key={shift} className="flex items-center gap-2">
                        <span className="text-[11px] text-muted w-[92px] shrink-0">
                          {SHIFT_LABELS[shift]}
                        </span>
                        <div className="flex-1 flex items-center gap-1.5 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ background: chatter?.color ?? 'var(--color-border, #555)' }}
                          />
                          <select
                            value={cid ?? ''}
                            onChange={(e) => void setSlot(m.id, shift, e.target.value || null)}
                            className={`flex-1 h-7 px-1.5 rounded-md border text-xs bg-surface min-w-0 ${
                              cid ? 'border-border text-ink' : 'border-dashed border-border text-faint'
                            }`}
                          >
                            <option value="">— нет чаттера —</option>
                            {activeChatters.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeChatters.length === 0 && models.length > 0 && (
        <div className="mt-4 text-xs text-faint flex items-center gap-1.5">
          <UserPlus size={13} /> Сначала добавьте чаттеров во вкладке «Чаттеры», чтобы закреплять их за сменами.
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Plus, Trash2, Save, Send } from 'lucide-react';
import { SHIFT_LABELS } from '@swit/shared';
import type { AgencyChatter } from '@swit/shared';
import { api } from '../../api';
import { useAgencyStore } from '../../lib/agency';

interface Draft {
  name: string;
  telegram: string;
  experience: string;
  trc20: string;
  percent: string; // строкой, пусто = личный % не задан (берётся дефолт агентства)
  color: string;
  notes: string;
  active: boolean;
}

function toDraft(c: AgencyChatter): Draft {
  return {
    name: c.name,
    telegram: c.telegram ?? '',
    experience: c.experience ?? '',
    trc20: c.trc20 ?? '',
    percent: c.percent != null ? String(c.percent) : '',
    color: c.color ?? '#2563EB',
    notes: c.notes ?? '',
    active: !!c.active
  };
}

const inputCls =
  'w-full h-9 px-2.5 rounded-md border border-border bg-surface text-sm focus:outline-none focus:border-accent';

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="block text-[11px] uppercase text-muted mb-1">{label}</span>
      {children}
    </label>
  );
}

export default function ChattersPanel() {
  const agencyId = useAgencyStore((s) => s.selectedId);
  const chatters = useAgencyStore((s) => s.chatters);
  const models = useAgencyStore((s) => s.models);
  const assignments = useAgencyStore((s) => s.assignments);
  const reload = useAgencyStore((s) => s.reloadEntities);

  const [newName, setNewName] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const selected = chatters.find((c) => c.id === selectedId) ?? null;

  // Сидируем форму только при смене выбранного чаттера — realtime-перезагрузка
  // списка не должна затирать то, что админ сейчас редактирует.
  useEffect(() => {
    setDraft(selected ? toDraft(selected) : null);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!agencyId) return null;

  async function addChatter(): Promise<void> {
    const name = newName.trim();
    if (!name || !agencyId) return;
    const c = await api.createAgencyChatter({ agency_id: agencyId, name });
    setNewName('');
    await reload();
    setSelectedId(c.id);
  }

  async function save(): Promise<void> {
    if (!selected || !draft) return;
    const percentNum = draft.percent.trim() === '' ? null : Number(draft.percent);
    setSaving(true);
    try {
      await api.updateAgencyChatter(selected.id, {
        name: draft.name.trim() || selected.name,
        telegram: draft.telegram.trim() || null,
        experience: draft.experience.trim() || null,
        trc20: draft.trc20.trim() || null,
        percent: percentNum != null && !Number.isNaN(percentNum) ? percentNum : null,
        color: draft.color,
        notes: draft.notes.trim() || null,
        active: draft.active ? 1 : 0
      });
      await reload();
    } finally {
      setSaving(false);
    }
  }

  async function remove(c: AgencyChatter): Promise<void> {
    if (!confirm(`Удалить чаттера «${c.name}»?`)) return;
    await api.deleteAgencyChatter(c.id);
    if (selectedId === c.id) setSelectedId(null);
    await reload();
  }

  const myAssignments = selected ? assignments.filter((a) => a.chatter_id === selected.id) : [];

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      {/* Список */}
      <div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void addChatter();
          }}
          className="flex gap-2 mb-3"
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="+ Новый чаттер"
            className="flex-1 h-9 px-3 rounded-md border border-border bg-surface text-sm focus:outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={!newName.trim()}
            className="bg-accent text-white w-9 h-9 rounded-md flex items-center justify-center disabled:opacity-40"
          >
            <Plus size={16} />
          </button>
        </form>

        {chatters.length === 0 ? (
          <div className="text-sm text-faint border border-dashed border-border rounded-lg py-8 text-center">
            Нет чаттеров
          </div>
        ) : (
          <div className="space-y-1">
            {chatters.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm text-left transition ${
                  selectedId === c.id ? 'bg-accent/10 ring-1 ring-accent' : 'hover:bg-surface2'
                }`}
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ background: c.color ?? '#2563EB' }}
                />
                <span className={`flex-1 truncate ${c.active ? 'text-ink' : 'text-faint line-through'}`}>
                  {c.name}
                </span>
                <span className="text-[11px] text-muted timer-font">
                  {c.percent != null ? `${c.percent}%` : '·'}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Профиль */}
      {selected && draft ? (
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={draft.color}
                onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                className="w-7 h-7 rounded cursor-pointer bg-transparent border border-border"
                title="Цвет-метка"
              />
              <span className="font-semibold text-ink">Профиль чаттера</span>
            </div>
            <button
              onClick={() => void remove(selected)}
              className="text-faint hover:text-danger flex items-center gap-1 text-xs"
            >
              <Trash2 size={13} /> Удалить
            </button>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Имя">
              <input className={inputCls} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </Field>
            <Field label="Telegram">
              <input className={inputCls} value={draft.telegram} placeholder="@username" onChange={(e) => setDraft({ ...draft, telegram: e.target.value })} />
            </Field>
            <Field label="% от NET (пусто = дефолт агентства)">
              <input className={inputCls} value={draft.percent} inputMode="decimal" placeholder="напр. 5" onChange={(e) => setDraft({ ...draft, percent: e.target.value })} />
            </Field>
            <Field label="Опыт">
              <input className={inputCls} value={draft.experience} placeholder="напр. 1 год" onChange={(e) => setDraft({ ...draft, experience: e.target.value })} />
            </Field>
            <Field label="Кошелёк TRC20 (USDT)" wide>
              <input className={`${inputCls} font-mono`} value={draft.trc20} placeholder="T..." onChange={(e) => setDraft({ ...draft, trc20: e.target.value })} />
            </Field>
            <Field label="Заметки" wide>
              <textarea
                className={`${inputCls} resize-none`}
                rows={2}
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </Field>
          </div>

          <label className="flex items-center gap-2 mt-3 text-sm text-ink cursor-pointer">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
            />
            Активен (доступен для закрепления за сменами)
          </label>

          {/* Закрепления */}
          <div className="mt-4">
            <div className="text-xs uppercase text-muted mb-1.5">Закрепления</div>
            {myAssignments.length === 0 ? (
              <div className="text-xs text-faint">Нет закреплений. Назначьте на вкладке «Модели».</div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {myAssignments.map((a) => {
                  const model = models.find((m) => m.id === a.model_id);
                  return (
                    <span
                      key={a.id}
                      className="text-[11px] px-2 py-1 rounded-full bg-surface2 text-ink border border-border"
                    >
                      {model?.name ?? '—'} · {SHIFT_LABELS[a.shift]}
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={() => void save()}
              disabled={saving}
              className="bg-accent text-white px-4 h-9 rounded-md text-sm flex items-center gap-1.5 disabled:opacity-50"
            >
              <Save size={15} /> Сохранить
            </button>
            {draft.telegram.trim() && (
              <a
                href={`https://t.me/${draft.telegram.replace(/^@/, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-accent hover:underline flex items-center gap-1"
              >
                <Send size={12} /> Открыть Telegram
              </a>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border flex items-center justify-center text-sm text-faint min-h-[200px]">
          Выберите чаттера слева, чтобы открыть профиль
        </div>
      )}
    </div>
  );
}

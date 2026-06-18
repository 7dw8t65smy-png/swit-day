import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Pin, FilterX } from 'lucide-react';
import { SHIFT_LABELS, SHIFTS } from '@swit/shared';
import type { AgencyShiftRow, AgencyShift } from '@swit/shared';
import { api } from '../../api';
import { useAgencyStore } from '../../lib/agency';
import { useAuth } from '../../lib/auth';
import { useRealtimeRefetch } from '../../hooks/useRealtimeRefetch';

interface Filters {
  chatter_id: string;
  model_id: string;
  from: string;
  to: string;
}
const EMPTY: Filters = { chatter_id: '', model_id: '', from: '', to: '' };
const fCls = 'h-9 px-2 rounded-md border border-border bg-surface text-xs';

function monthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function ShiftsPanel() {
  const agencyId = useAgencyStore((s) => s.selectedId);
  const chatters = useAgencyStore((s) => s.chatters);
  const models = useAgencyStore((s) => s.models);

  const [rows, setRows] = useState<AgencyShiftRow[]>([]);
  const [filters, setFilters] = useState<Filters>({ ...EMPTY, from: monthStart(), to: today() });
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ date: today(), chatter_id: '', model_id: '', shift: '' as '' | AgencyShift, note: '' });

  const load = useCallback(async () => {
    if (!agencyId) return;
    const list = await api.agencyShifts({
      agency_id: agencyId,
      chatter_id: filters.chatter_id || undefined,
      model_id: filters.model_id || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined
    });
    setRows(list);
  }, [agencyId, filters]);

  useEffect(() => {
    void load();
  }, [load]);
  useRealtimeRefetch(() => void load());

  async function patchNote(r: AgencyShiftRow, note: string): Promise<void> {
    if (!agencyId || (r.note ?? '') === note) return;
    await api.upsertAgencyShift({
      agency_id: agencyId,
      chatter_id: r.chatter_id,
      model_id: r.model_id,
      date: r.date,
      shift: r.shift,
      note: note || null
    });
    await load();
    useAuth.getState().bumpData();
  }

  async function toggleFixed(r: AgencyShiftRow): Promise<void> {
    if (!agencyId) return;
    await api.upsertAgencyShift({
      agency_id: agencyId,
      chatter_id: r.chatter_id,
      model_id: r.model_id,
      date: r.date,
      shift: r.shift,
      is_fixed: r.is_fixed ? 0 : 1
    });
    await load();
    useAuth.getState().bumpData();
  }

  async function addManual(): Promise<void> {
    if (!agencyId || !draft.date) return;
    await api.createAgencyShift({
      agency_id: agencyId,
      chatter_id: draft.chatter_id || null,
      model_id: draft.model_id || null,
      date: draft.date,
      shift: (draft.shift || null) as AgencyShift | null,
      note: draft.note || null
    });
    setDraft({ date: today(), chatter_id: '', model_id: '', shift: '', note: '' });
    setAdding(false);
    await load();
    useAuth.getState().bumpData();
  }

  async function removeManual(r: AgencyShiftRow): Promise<void> {
    if (!r.id) return;
    if (!confirm('Удалить запись смены?')) return;
    await api.deleteAgencyShift(r.id);
    await load();
    useAuth.getState().bumpData();
  }

  if (!agencyId) return null;
  const hasFilters = !!(filters.chatter_id || filters.model_id);

  let lastDate = '';

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          onClick={() => setAdding((v) => !v)}
          className="bg-accent text-white px-3 h-9 rounded-md text-sm flex items-center gap-1.5 hover:brightness-110 transition active:scale-[0.98]"
        >
          <Plus size={15} /> Смена вручную
        </button>
        <span className="flex-1" />
        <select value={filters.chatter_id} onChange={(e) => setFilters({ ...filters, chatter_id: e.target.value })} className={fCls}>
          <option value="">Все чаттеры</option>
          {chatters.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select value={filters.model_id} onChange={(e) => setFilters({ ...filters, model_id: e.target.value })} className={fCls}>
          <option value="">Все модели</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} className={fCls} />
        <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} className={fCls} />
        {hasFilters && (
          <button onClick={() => setFilters({ ...EMPTY, from: filters.from, to: filters.to })} className="text-faint hover:text-ink px-1" title="Сбросить">
            <FilterX size={16} />
          </button>
        )}
      </div>

      {adding && (
        <div className="flex flex-wrap items-end gap-2 mb-4 p-3 rounded-lg border border-border bg-surface2/50 animate-rise">
          <label className="text-xs text-muted">Дата<input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} className={`${fCls} block mt-0.5`} /></label>
          <label className="text-xs text-muted">Чаттер
            <select value={draft.chatter_id} onChange={(e) => setDraft({ ...draft, chatter_id: e.target.value })} className={`${fCls} block mt-0.5`}>
              <option value="">—</option>
              {chatters.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
          </label>
          <label className="text-xs text-muted">Модель
            <select value={draft.model_id} onChange={(e) => setDraft({ ...draft, model_id: e.target.value })} className={`${fCls} block mt-0.5`}>
              <option value="">—</option>
              {models.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
            </select>
          </label>
          <label className="text-xs text-muted">Смена
            <select value={draft.shift} onChange={(e) => setDraft({ ...draft, shift: e.target.value as '' | AgencyShift })} className={`${fCls} block mt-0.5`}>
              <option value="">—</option>
              {SHIFTS.map((s) => (<option key={s} value={s}>{SHIFT_LABELS[s]}</option>))}
            </select>
          </label>
          <label className="text-xs text-muted flex-1 min-w-[160px]">Заметка
            <input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="напр. выходной / обучение" className={`${fCls} block mt-0.5 w-full`} />
          </label>
          <button onClick={() => void addManual()} className="bg-accent text-white px-3 h-9 rounded-md text-sm">Добавить</button>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="text-sm text-faint border border-dashed border-border rounded-lg py-10 text-center">
          Нет смен за период. Они появятся из продаж или добавь вручную.
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-surface2 text-muted">
              <tr>
                <th className="text-left font-medium px-2 py-2">Дата</th>
                <th className="text-left font-medium px-2 py-2">Смена</th>
                <th className="text-left font-medium px-2 py-2">Чаттер</th>
                <th className="text-left font-medium px-2 py-2">Модель</th>
                <th className="text-right font-medium px-2 py-2">Продаж</th>
                <th className="text-right font-medium px-2 py-2">NET</th>
                <th className="text-right font-medium px-2 py-2">Выплата</th>
                <th className="text-center font-medium px-2 py-2">Фикс</th>
                <th className="text-left font-medium px-2 py-2">Заметка</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const showDate = r.date !== lastDate;
                lastDate = r.date;
                return (
                  <tr key={(r.id ?? 'auto') + '|' + i} className={`border-t border-border group ${showDate ? 'border-t-2' : ''}`}>
                    <td className="px-2 py-1.5 whitespace-nowrap text-ink">{showDate ? r.date : ''}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{r.shift ? SHIFT_LABELS[r.shift] : '—'}</td>
                    <td className="px-2 py-1.5">{r.chatter_name}</td>
                    <td className="px-2 py-1.5">{r.model_name}</td>
                    <td className="px-2 py-1.5 text-right">{r.manual && r.count === 0 ? '—' : r.count}</td>
                    <td className="px-2 py-1.5 text-right timer-font">${r.net.toFixed(2)}</td>
                    <td className="px-2 py-1.5 text-right timer-font text-emerald-500">${r.payout.toFixed(2)}</td>
                    <td className="px-2 py-1.5 text-center">
                      <button
                        onClick={() => void toggleFixed(r)}
                        title={r.is_fixed ? 'Фикс на модели в этот день — снять' : 'Отметить фикс на модели в этот день'}
                        className={r.is_fixed ? 'text-amber-500' : 'text-faint hover:text-ink'}
                      >
                        <Pin size={15} className={r.is_fixed ? 'fill-amber-500' : ''} />
                      </button>
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        defaultValue={r.note ?? ''}
                        key={(r.id ?? 'a') + (r.note ?? '')}
                        onBlur={(e) => void patchNote(r, e.target.value.trim())}
                        placeholder="заметка…"
                        className="w-full min-w-[140px] h-7 px-2 rounded border border-transparent hover:border-border focus:border-accent bg-transparent focus:bg-surface text-xs focus:outline-none"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {r.manual ? (
                        <button onClick={() => void removeManual(r)} className="text-faint hover:text-danger opacity-0 group-hover:opacity-100" title="Удалить ручную запись">
                          <Trash2 size={13} />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

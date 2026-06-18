import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Plus, Trash2, Pin, MessageSquare } from 'lucide-react';
import { SHIFT_LABELS } from '@swit/shared';
import type { AgencyShiftRow, AgencyShift } from '@swit/shared';
import { api } from '../../api';
import { useAgencyStore } from '../../lib/agency';
import { useAuth } from '../../lib/auth';
import { useRealtimeRefetch } from '../../hooks/useRealtimeRefetch';
import { exportShiftsToXlsx } from '../../lib/agencyExport';

// Смены в хронологическом порядке суток (как на референсе: I 01–07 … IV 19–01).
const SHIFT_GRID: { key: AgencyShift; label: string; time: string; color: string }[] = [
  { key: 'night', label: 'I смена', time: '01–07', color: '#7C3AED' },
  { key: 'morning', label: 'II смена', time: '07–13', color: '#2563EB' },
  { key: 'day', label: 'III смена', time: '13–19', color: '#16A34A' },
  { key: 'evening', label: 'IV смена', time: '19–01', color: '#D97706' }
];
const DOW = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const PALETTE = ['#2563EB', '#DB2777', '#16A34A', '#D97706', '#7C3AED', '#0891B2', '#DC2626', '#059669'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function fmt(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function mondayOf(d: Date): Date {
  const x = new Date(d);
  const off = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - off);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % PALETTE.length;
  return PALETTE[h];
}

function Avatar({ name, color }: { name: string; color?: string | null }): JSX.Element {
  const letter = (name || '?').trim().charAt(0).toUpperCase();
  return (
    <span
      className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white shrink-0"
      style={{ background: color || colorFor(name) }}
    >
      {letter}
    </span>
  );
}

export default function ShiftsPanel(): JSX.Element | null {
  const agencyId = useAgencyStore((s) => s.selectedId);
  const agencies = useAgencyStore((s) => s.agencies);
  const chatters = useAgencyStore((s) => s.chatters);
  const models = useAgencyStore((s) => s.models);
  const reloadEntities = useAgencyStore((s) => s.reloadEntities);

  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()));
  const [rows, setRows] = useState<AgencyShiftRow[]>([]);
  const [draft, setDraft] = useState({ chatter_id: '', model_id: '', shift: '' as '' | AgencyShift, date: fmt(new Date()) });
  const [newModel, setNewModel] = useState('');

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const from = fmt(weekStart);
  const to = fmt(addDays(weekStart, 6));

  const load = useCallback(async () => {
    if (!agencyId) return;
    setRows(await api.agencyShifts({ agency_id: agencyId, from, to }));
  }, [agencyId, from, to]);

  useEffect(() => {
    void load();
  }, [load]);
  useRealtimeRefetch(() => void load());

  const chatterColor = (id: string | null): string | undefined =>
    (id ? chatters.find((c) => c.id === id)?.color : undefined) ?? undefined;

  function cellRows(dateStr: string, shift: AgencyShift): AgencyShiftRow[] {
    return rows.filter((r) => r.date === dateStr && r.shift === shift);
  }
  const dayTotal = (dateStr: string): number =>
    rows.filter((r) => r.date === dateStr).reduce((s, r) => s + r.payout, 0);
  const weekTotal = rows.reduce((s, r) => s + r.payout, 0);
  const entryCount = rows.length;

  async function patchNote(r: AgencyShiftRow, note: string): Promise<void> {
    if (!agencyId || (r.note ?? '') === note) return;
    await api.upsertAgencyShift({ agency_id: agencyId, chatter_id: r.chatter_id, model_id: r.model_id, date: r.date, shift: r.shift, note: note || null });
    await load();
    useAuth.getState().bumpData();
  }
  async function toggleFixed(r: AgencyShiftRow): Promise<void> {
    if (!agencyId) return;
    await api.upsertAgencyShift({ agency_id: agencyId, chatter_id: r.chatter_id, model_id: r.model_id, date: r.date, shift: r.shift, is_fixed: r.is_fixed ? 0 : 1 });
    await load();
    useAuth.getState().bumpData();
  }
  async function removeManual(r: AgencyShiftRow): Promise<void> {
    if (!r.id) return;
    await api.deleteAgencyShift(r.id);
    await load();
    useAuth.getState().bumpData();
  }
  async function addShift(over?: { date: string; shift: AgencyShift }): Promise<void> {
    if (!agencyId) return;
    const d = over?.date ?? draft.date;
    const sh = over?.shift ?? (draft.shift || null);
    if (!draft.chatter_id) return;
    await api.createAgencyShift({
      agency_id: agencyId,
      chatter_id: draft.chatter_id,
      model_id: draft.model_id || null,
      date: d,
      shift: (sh || null) as AgencyShift | null
    });
    await load();
    useAuth.getState().bumpData();
  }
  async function setRate(modelId: string, rate: number): Promise<void> {
    await api.updateAgencyModel(modelId, { rate });
    await reloadEntities();
  }
  async function addModel(): Promise<void> {
    const name = newModel.trim();
    if (!name || !agencyId) return;
    await api.createAgencyModel({ agency_id: agencyId, name });
    setNewModel('');
    await reloadEntities();
  }
  function download(): void {
    const agencyName = agencies.find((a) => a.id === agencyId)?.name ?? 'Агентство';
    exportShiftsToXlsx(rows, `Смены ${agencyName} ${from}—${to}.xlsx`);
  }

  if (!agencyId) return null;
  const todayStr = fmt(new Date());

  return (
    <div className="flex gap-4 items-start">
      {/* Сетка недели */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-3">
          <button onClick={() => setWeekStart((w) => addDays(w, -7))} className="h-9 w-9 rounded-lg border border-border bg-surface text-muted hover:text-ink flex items-center justify-center">
            <ChevronLeft size={16} />
          </button>
          <div className="px-3 h-9 rounded-lg border border-border bg-surface text-sm flex items-center font-medium">
            {from} — {to}
          </div>
          <button onClick={() => setWeekStart((w) => addDays(w, 7))} className="h-9 w-9 rounded-lg border border-border bg-surface text-muted hover:text-ink flex items-center justify-center">
            <ChevronRight size={16} />
          </button>
          <button onClick={() => setWeekStart(mondayOf(new Date()))} className="px-3 h-9 rounded-lg border border-border bg-surface text-sm text-muted hover:text-ink">
            Эта неделя
          </button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border">
          <div className="min-w-[920px]">
            {/* Шапка дней */}
            <div className="grid" style={{ gridTemplateColumns: '88px repeat(7, minmax(116px, 1fr))' }}>
              <div className="bg-surface2 border-b border-border" />
              {days.map((d) => {
                const ds = fmt(d);
                return (
                  <div key={ds} className={`bg-surface2 border-b border-l border-border px-2 py-2 text-center ${ds === todayStr ? 'ring-1 ring-accent ring-inset' : ''}`}>
                    <div className="text-xs text-muted">{DOW[(d.getDay() + 6) % 7]}, {pad(d.getDate())}.{pad(d.getMonth() + 1)}</div>
                    <div className={`text-sm font-semibold timer-font ${dayTotal(ds) > 0 ? 'text-emerald-500' : 'text-faint'}`}>${dayTotal(ds).toFixed(2)}</div>
                  </div>
                );
              })}
            </div>

            {/* Ряды смен */}
            {SHIFT_GRID.map((sh) => (
              <div key={sh.key} className="grid" style={{ gridTemplateColumns: '88px repeat(7, minmax(116px, 1fr))' }}>
                <div className="border-b border-border px-2 py-2 bg-surface/50">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-ink">
                    <span className="w-2 h-2 rounded-full" style={{ background: sh.color }} />
                    {sh.label}
                  </div>
                  <div className="text-[10px] text-muted mt-0.5">{sh.time}</div>
                </div>
                {days.map((d) => {
                  const ds = fmt(d);
                  const entries = cellRows(ds, sh.key);
                  return (
                    <div key={ds + sh.key} className="border-b border-l border-border p-1.5 space-y-1.5 align-top min-h-[92px]">
                      {entries.map((r, i) => (
                        <div key={(r.id ?? 'a') + i} className="rounded-lg border border-border bg-surface p-1.5 group/card lift">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Avatar name={r.chatter_name} color={chatterColor(r.chatter_id)} />
                            <span className="text-[11px] text-ink truncate flex-1">{r.chatter_name}</span>
                            <button onClick={() => void toggleFixed(r)} title={r.is_fixed ? 'Фикс — снять' : 'Отметить фикс'} className={r.is_fixed ? 'text-amber-500' : 'text-faint hover:text-ink'}>
                              <Pin size={12} className={r.is_fixed ? 'fill-amber-500' : ''} />
                            </button>
                            {r.manual === 1 && (
                              <button onClick={() => void removeManual(r)} className="text-faint hover:text-danger opacity-0 group-hover/card:opacity-100" title="Удалить">
                                <Trash2 size={11} />
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colorFor(r.model_name) }} />
                            <span className="text-[11px] text-muted truncate">{r.model_name}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className={`text-xs font-semibold timer-font ${r.payout > 0 ? 'text-emerald-500' : 'text-faint'}`}>${r.payout.toFixed(2)}</span>
                            {r.count > 0 && (
                              <span className="flex items-center gap-0.5 text-[10px] text-faint"><MessageSquare size={10} /> {r.count}</span>
                            )}
                          </div>
                          <input
                            key={(r.id ?? 'a') + (r.note ?? '')}
                            defaultValue={r.note ?? ''}
                            onBlur={(e) => void patchNote(r, e.target.value.trim())}
                            placeholder="Заметка"
                            className="mt-1 w-full h-6 px-1.5 rounded border border-transparent hover:border-border focus:border-accent bg-transparent focus:bg-surface2 text-[10px] focus:outline-none"
                          />
                        </div>
                      ))}
                      <button
                        onClick={() => {
                          setDraft((dr) => ({ ...dr, date: ds, shift: sh.key }));
                          void (draft.chatter_id ? addShift({ date: ds, shift: sh.key }) : Promise.resolve());
                        }}
                        className="w-full rounded-lg border border-dashed border-border text-faint hover:text-accent hover:border-accent/50 text-[11px] py-1.5 flex items-center justify-center gap-1 transition"
                        title="Заполнить чаттера в форме справа и нажмите здесь"
                      >
                        <Plus size={12} /> чаттер
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Сайдбар */}
      <div className="w-[300px] shrink-0 space-y-4">
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="text-3xl font-bold timer-font text-emerald-500">${weekTotal.toFixed(2)}</div>
          <div className="text-xs text-muted">выплат за неделю</div>
          <div className="flex gap-4 mt-3">
            <div>
              <div className="text-lg font-semibold timer-font text-ink leading-none">{entryCount * 6}</div>
              <div className="text-[10px] text-muted mt-0.5">часов (смен×6)</div>
            </div>
            <div>
              <div className="text-lg font-semibold timer-font text-ink leading-none">{entryCount}</div>
              <div className="text-[10px] text-muted mt-0.5">записей смен</div>
            </div>
          </div>
          <button onClick={download} className="mt-3 w-full h-9 rounded-lg border border-border bg-surface2 text-sm text-ink hover:brightness-110 flex items-center justify-center gap-1.5 transition">
            <Download size={14} /> Скачать отчёт
          </button>
        </div>

        {/* Быстрое добавление смены */}
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="text-sm font-semibold text-ink mb-2">Быстрое добавление смены</div>
          <div className="space-y-2">
            <select value={draft.chatter_id} onChange={(e) => setDraft({ ...draft, chatter_id: e.target.value })} className={sCls}>
              <option value="">Выберите чаттера</option>
              {chatters.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
            <select value={draft.model_id} onChange={(e) => setDraft({ ...draft, model_id: e.target.value })} className={sCls}>
              <option value="">Выберите модель</option>
              {models.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
            </select>
            <select value={draft.shift} onChange={(e) => setDraft({ ...draft, shift: e.target.value as '' | AgencyShift })} className={sCls}>
              <option value="">Выберите смену</option>
              {SHIFT_GRID.map((s) => (<option key={s.key} value={s.key}>{SHIFT_LABELS[s.key]}</option>))}
            </select>
            <input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} className={sCls} />
            <button
              onClick={() => void addShift()}
              disabled={!draft.chatter_id}
              className="w-full h-9 rounded-lg bg-accent text-white text-sm disabled:opacity-40 hover:brightness-110 transition active:scale-[0.98]"
            >
              Добавить смену
            </button>
          </div>
        </div>

        {/* Ставки по моделям */}
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="text-sm font-semibold text-ink mb-2">Ставки по моделям</div>
          <div className="space-y-1.5">
            {models.map((m) => (
              <div key={m.id} className="flex items-center gap-2">
                <Avatar name={m.name} color={colorFor(m.name)} />
                <span className="text-sm text-ink flex-1 truncate">{m.name}</span>
                <span className="text-xs text-muted">$</span>
                <input
                  type="number"
                  step="0.01"
                  defaultValue={m.rate ?? 0}
                  key={m.id + (m.rate ?? 0)}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v) && v !== (m.rate ?? 0)) void setRate(m.id, v);
                  }}
                  className="w-16 h-7 px-1.5 rounded border border-border bg-surface text-xs text-right focus:outline-none focus:border-accent"
                />
              </div>
            ))}
            {models.length === 0 && <div className="text-xs text-faint">Нет моделей</div>}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void addModel();
            }}
            className="flex gap-1.5 mt-2"
          >
            <input value={newModel} onChange={(e) => setNewModel(e.target.value)} placeholder="Новая модель" className={`${sCls} flex-1`} />
            <button type="submit" disabled={!newModel.trim()} className="h-9 px-3 rounded-lg border border-border bg-surface2 text-sm disabled:opacity-40 flex items-center gap-1">
              <Plus size={14} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

const sCls = 'w-full h-9 px-2.5 rounded-md border border-border bg-surface text-sm focus:outline-none focus:border-accent transition-colors';

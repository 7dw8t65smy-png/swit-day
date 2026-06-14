import { useCallback, useEffect, useState } from 'react';
import { ClipboardPaste, Trash2, Ban, Check, FilterX, RefreshCw } from 'lucide-react';
import { SHIFT_LABELS, SHIFTS } from '@swit/shared';
import type { AgencySale } from '@swit/shared';
import { api } from '../../api';
import { useAgencyStore } from '../../lib/agency';
import { useRealtimeRefetch } from '../../hooks/useRealtimeRefetch';
import { pushToast } from '../../hooks/useToasts';
import SalesImportModal from './SalesImportModal';

const KIND_LABEL: Record<string, string> = {
  message: 'Сообщение',
  tip: 'Чай',
  post: 'Пост',
  subscription: 'Подписка',
  other: 'Другое'
};

interface Filters {
  model_id: string;
  chatter_id: string; // '' | 'none' | id
  shift: string;
  from: string;
  to: string;
}

const EMPTY: Filters = { model_id: '', chatter_id: '', shift: '', from: '', to: '' };
const fCls = 'h-9 px-2 rounded-md border border-border bg-surface text-xs';

export default function SalesPanel() {
  const agencyId = useAgencyStore((s) => s.selectedId);
  const models = useAgencyStore((s) => s.models);
  const chatters = useAgencyStore((s) => s.chatters);
  const reloadEntities = useAgencyStore((s) => s.reloadEntities);

  const [sales, setSales] = useState<AgencySale[]>([]);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [showImport, setShowImport] = useState(false);
  const [recomputing, setRecomputing] = useState(false);

  const modelName = (id: string): string => models.find((m) => m.id === id)?.name ?? '—';

  const load = useCallback(async () => {
    if (!agencyId) return;
    const list = await api.agencySales({
      agency_id: agencyId,
      model_id: filters.model_id || undefined,
      chatter_id: filters.chatter_id || undefined,
      shift: filters.shift || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined
    });
    setSales(list);
  }, [agencyId, filters]);

  useEffect(() => {
    void load();
  }, [load]);
  useRealtimeRefetch(() => void load());

  async function reassign(s: AgencySale, chatterId: string): Promise<void> {
    await api.updateAgencySale(s.id, { chatter_id: chatterId || null });
    await load();
  }

  async function toggleCounts(s: AgencySale): Promise<void> {
    const next = s.counts_for_payout ? 0 : 1;
    await api.updateAgencySale(s.id, {
      counts_for_payout: next,
      excluded_reason: next ? null : 'Исключено вручную'
    });
    await load();
  }

  async function remove(s: AgencySale): Promise<void> {
    if (!confirm('Удалить продажу?')) return;
    await api.deleteAgencySale(s.id);
    await load();
  }

  // Пересчитать продажи по текущим настройкам (типы в ЗП + правила сумм)
  // и пересинхронизировать смену со сменой назначенного чаттера.
  async function recompute(): Promise<void> {
    if (!agencyId) return;
    setRecomputing(true);
    try {
      const res = await api.recomputeAgencySales(agencyId);
      await load();
      pushToast({ kind: 'info', message: `Обновлено продаж: ${res.updated}` });
    } finally {
      setRecomputing(false);
    }
  }

  // Создать правило исключения по сумме + сразу исключить все загруженные продажи с этой суммой.
  // Ярлык ставим автоматически (window.prompt в Electron не работает); переименовать
  // или удалить правило можно в настройках агентства.
  async function makeRule(s: AgencySale): Promise<void> {
    if (!agencyId) return;
    if (!confirm(`Не учитывать в ЗП все продажи на сумму $${s.amount.toFixed(2)}? Будет создано правило исключения.`)) return;
    const label = `Исключение $${s.amount.toFixed(2)}`;
    await api.createAgencyRule({ agency_id: agencyId, amount: s.amount, label });
    const same = sales.filter((x) => Math.abs(x.amount - s.amount) < 0.005 && x.counts_for_payout);
    await Promise.all(
      same.map((x) => api.updateAgencySale(x.id, { counts_for_payout: 0, excluded_reason: label }))
    );
    await reloadEntities(); // правила обновились
    await load();
    pushToast({ kind: 'info', message: `Правило добавлено. Исключено продаж: ${same.length}` });
  }

  if (!agencyId) return null;
  const hasFilters = JSON.stringify(filters) !== JSON.stringify(EMPTY);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          onClick={() => setShowImport(true)}
          className="bg-accent text-white px-3 h-9 rounded-md text-sm flex items-center gap-1.5 hover:brightness-110 transition active:scale-[0.98]"
        >
          <ClipboardPaste size={15} /> Вставить продажи
        </button>
        <button
          onClick={() => void recompute()}
          disabled={recomputing}
          title="Применить текущие настройки агентства (типы в ЗП и правила) ко всем продажам"
          className="px-3 h-9 rounded-md text-sm flex items-center gap-1.5 border border-border bg-surface text-muted hover:text-ink transition disabled:opacity-50"
        >
          <RefreshCw size={14} className={recomputing ? 'animate-spin' : ''} /> Обновить
        </button>

        <span className="flex-1" />

        <select value={filters.model_id} onChange={(e) => setFilters({ ...filters, model_id: e.target.value })} className={fCls}>
          <option value="">Все модели</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        <select value={filters.chatter_id} onChange={(e) => setFilters({ ...filters, chatter_id: e.target.value })} className={fCls}>
          <option value="">Все чаттеры</option>
          <option value="none">— не определён —</option>
          {chatters.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select value={filters.shift} onChange={(e) => setFilters({ ...filters, shift: e.target.value })} className={fCls}>
          <option value="">Все смены</option>
          {SHIFTS.map((s) => (
            <option key={s} value={s}>{SHIFT_LABELS[s]}</option>
          ))}
        </select>
        <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} className={fCls} title="С даты" />
        <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} className={fCls} title="По дату" />
        {hasFilters && (
          <button onClick={() => setFilters(EMPTY)} className="text-faint hover:text-ink px-1" title="Сбросить фильтры">
            <FilterX size={16} />
          </button>
        )}
      </div>

      {sales.length === 0 ? (
        <div className="text-sm text-faint border border-dashed border-border rounded-lg py-10 text-center">
          Нет продаж{hasFilters ? ' по фильтрам' : ''}. Нажмите «Вставить продажи», чтобы добавить.
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-surface2 text-muted">
              <tr>
                <th className="text-left font-medium px-2 py-2">Дата</th>
                <th className="text-left font-medium px-2 py-2">Модель</th>
                <th className="text-left font-medium px-2 py-2">Фанат</th>
                <th className="text-left font-medium px-2 py-2">Тип</th>
                <th className="text-right font-medium px-2 py-2">Сумма</th>
                <th className="text-right font-medium px-2 py-2">NET</th>
                <th className="text-left font-medium px-2 py-2">Смена</th>
                <th className="text-left font-medium px-2 py-2">Чаттер</th>
                <th className="text-center font-medium px-2 py-2">В ЗП</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.id} className={`border-t border-border group ${s.counts_for_payout ? '' : 'opacity-60'}`}>
                  <td className="px-2 py-1.5 whitespace-nowrap text-ink">{s.local_date}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{modelName(s.model_id)}</td>
                  <td className="px-2 py-1.5 truncate max-w-[120px]">{s.fan_name ?? '—'}</td>
                  <td className="px-2 py-1.5">{KIND_LABEL[s.kind] ?? s.kind}</td>
                  <td className="px-2 py-1.5 text-right timer-font">${s.amount.toFixed(2)}</td>
                  <td className="px-2 py-1.5 text-right timer-font">${s.net.toFixed(2)}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{s.shift ? SHIFT_LABELS[s.shift] : '—'}</td>
                  <td className="px-2 py-1.5">
                    <select
                      value={s.chatter_id ?? ''}
                      onChange={(e) => void reassign(s, e.target.value)}
                      className={`h-7 px-1 rounded border text-xs bg-surface max-w-[120px] ${
                        s.chatter_id ? 'border-border text-ink' : 'border-dashed border-amber-500 text-amber-600'
                      }`}
                    >
                      <option value="">— не определён —</option>
                      {chatters.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <button
                      onClick={() => void toggleCounts(s)}
                      title={s.counts_for_payout ? `В ЗП — выключить${s.excluded_reason ? ` (${s.excluded_reason})` : ''}` : `Не в ЗП${s.excluded_reason ? ` (${s.excluded_reason})` : ''} — включить`}
                      className={s.counts_for_payout ? 'text-green-600' : 'text-faint'}
                    >
                      {s.counts_for_payout ? <Check size={15} /> : <Ban size={15} />}
                    </button>
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100">
                      <button onClick={() => void makeRule(s)} className="text-faint hover:text-accent text-[11px]" title="Создать правило исключения для этой суммы">
                        правило
                      </button>
                      <button onClick={() => void remove(s)} className="text-faint hover:text-danger" title="Удалить">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showImport && (
        <SalesImportModal onClose={() => setShowImport(false)} onDone={() => void load()} />
      )}
    </div>
  );
}

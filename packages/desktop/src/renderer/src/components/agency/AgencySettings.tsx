import { useState } from 'react';
import { X, Trash2, Plus, Save } from 'lucide-react';
import type { Agency, AgencyPayoutKinds, AgencySaleKind } from '@swit/shared';
import { api } from '../../api';
import { useAgencyStore } from '../../lib/agency';
import { useAuth } from '../../lib/auth';
import { pushToast } from '../../hooks/useToasts';

const DEFAULT_KINDS: AgencyPayoutKinds = {
  message: true,
  tip: true,
  post: true,
  subscription: true,
  other: true
};

const KIND_ROWS: { key: AgencySaleKind; label: string }[] = [
  { key: 'message', label: 'Сообщения' },
  { key: 'tip', label: 'Чаевые' },
  { key: 'post', label: 'Посты' },
  { key: 'subscription', label: 'Подписки' },
  { key: 'other', label: 'Прочее' }
];

// Часовые пояса аккаунта OnlyMonster (в минутах от UTC). UTC+5 по умолчанию.
const TZ_OPTIONS = [0, 60, 120, 180, 240, 300, 360].map((min) => ({
  min,
  label: `UTC+${min / 60}`
}));

function parseKinds(raw: string | null): AgencyPayoutKinds {
  if (!raw) return DEFAULT_KINDS;
  try {
    return { ...DEFAULT_KINDS, ...(JSON.parse(raw) as Partial<AgencyPayoutKinds>) };
  } catch {
    return DEFAULT_KINDS;
  }
}

const inputCls =
  'w-full h-9 px-2.5 rounded-md border border-border bg-surface text-sm focus:outline-none focus:border-accent';

export default function AgencySettings({ agency, onClose }: { agency: Agency; onClose: () => void }) {
  const rules = useAgencyStore((s) => s.rules);
  const reloadAll = useAgencyStore((s) => s.reloadAll);
  const reloadEntities = useAgencyStore((s) => s.reloadEntities);

  const [name, setName] = useState(agency.name);
  const [tz, setTz] = useState(agency.source_tz_offset);
  const [percent, setPercent] = useState(String(agency.default_percent));
  const [kinds, setKinds] = useState<AgencyPayoutKinds>(parseKinds(agency.payout_kinds));
  const [saving, setSaving] = useState(false);

  const [ruleAmount, setRuleAmount] = useState('');
  const [ruleLabel, setRuleLabel] = useState('');

  async function saveAgency(): Promise<void> {
    const p = Number(percent);
    setSaving(true);
    try {
      await api.updateAgency(agency.id, {
        name: name.trim() || agency.name,
        source_tz_offset: tz,
        default_percent: Number.isFinite(p) ? p : agency.default_percent,
        payout_kinds: kinds
      });
      // Сразу применяем новые правила/типы ко всем уже импортированным продажам.
      await api.recomputeAgencySales(agency.id);
      await reloadAll();
      // Обновляем уже открытые таблицы продаж/выплат в этом же окне
      // (свой realtime-сигнал клиент не получает — двигаем версию данных вручную).
      useAuth.getState().bumpData();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function addRule(): Promise<void> {
    const amt = Number(ruleAmount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    await api.createAgencyRule({ agency_id: agency.id, amount: amt, label: ruleLabel.trim() || null });
    setRuleAmount('');
    setRuleLabel('');
    // Применяем правило к уже импортированным продажам сразу.
    const res = await api.recomputeAgencySales(agency.id);
    await reloadEntities();
    useAuth.getState().bumpData();
    pushToast({ kind: 'info', message: `Правило добавлено. Продажи пересчитаны (${res.updated}).` });
  }

  async function removeRule(id: string): Promise<void> {
    await api.deleteAgencyRule(id);
    await api.recomputeAgencySales(agency.id);
    await reloadEntities();
    useAuth.getState().bumpData();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-bg rounded-2xl border border-border w-full max-w-lg max-h-[88vh] flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <span className="font-semibold text-ink">Настройки агентства</span>
          <button onClick={onClose} className="text-faint hover:text-ink">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          <label className="block">
            <span className="block text-[11px] uppercase text-muted mb-1">Название</span>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-[11px] uppercase text-muted mb-1">Часовой пояс OnlyMonster</span>
              <select className={inputCls} value={tz} onChange={(e) => setTz(Number(e.target.value))}>
                {TZ_OPTIONS.map((o) => (
                  <option key={o.min} value={o.min}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-[11px] uppercase text-muted mb-1">% по умолчанию (от NET)</span>
              <input className={inputCls} value={percent} inputMode="decimal" onChange={(e) => setPercent(e.target.value)} />
            </label>
          </div>
          <p className="text-[11px] text-faint -mt-2">Смены считаются в МСК. % применяется к новым чаттерам без личного %.</p>

          <div>
            <span className="block text-[11px] uppercase text-muted mb-1.5">Что идёт в ЗП чаттеру</span>
            <div className="flex flex-wrap gap-2">
              {KIND_ROWS.map((k) => (
                <label
                  key={k.key}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-sm cursor-pointer ${
                    kinds[k.key] ? 'border-accent bg-accent/10 text-ink' : 'border-border text-faint'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={kinds[k.key]}
                    onChange={(e) => setKinds({ ...kinds, [k.key]: e.target.checked })}
                  />
                  {k.label}
                </label>
              ))}
            </div>
          </div>

          {/* Правила исключения по сумме */}
          <div>
            <span className="block text-[11px] uppercase text-muted mb-1.5">
              Правила исключения по сумме (напр. приветственное сообщение)
            </span>
            {rules.length > 0 && (
              <div className="space-y-1 mb-2">
                {rules.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 text-sm bg-surface2 rounded-md px-2.5 py-1.5">
                    <span className="timer-font text-ink">${r.amount.toFixed(2)}</span>
                    <span className="text-muted flex-1 truncate">{r.label || 'без ярлыка'}</span>
                    <button onClick={() => void removeRule(r.id)} className="text-faint hover:text-danger">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void addRule();
              }}
              className="flex gap-2"
            >
              <input
                value={ruleAmount}
                onChange={(e) => setRuleAmount(e.target.value)}
                placeholder="Сумма"
                inputMode="decimal"
                className="h-9 px-2.5 rounded-md border border-border bg-surface text-sm w-24 shrink-0 focus:outline-none focus:border-accent transition-colors"
              />
              <input
                value={ruleLabel}
                onChange={(e) => setRuleLabel(e.target.value)}
                placeholder="Ярлык (необязательно)"
                className="h-9 px-2.5 rounded-md border border-border bg-surface text-sm flex-1 min-w-0 focus:outline-none focus:border-accent transition-colors"
              />
              <button
                type="submit"
                disabled={!ruleAmount.trim()}
                className="bg-accent text-white px-3 rounded-md text-sm flex items-center gap-1 shrink-0 disabled:opacity-40 hover:brightness-110 transition active:scale-[0.98]"
              >
                <Plus size={15} /> Добавить
              </button>
            </form>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
          <button onClick={onClose} className="px-3 h-9 rounded-md text-sm text-muted hover:text-ink">
            Закрыть
          </button>
          <button
            onClick={() => void saveAgency()}
            disabled={saving}
            className="bg-accent text-white px-4 h-9 rounded-md text-sm flex items-center gap-1.5 disabled:opacity-50"
          >
            <Save size={15} /> Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}

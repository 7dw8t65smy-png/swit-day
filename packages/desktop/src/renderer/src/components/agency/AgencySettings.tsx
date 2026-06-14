import { useState } from 'react';
import { X, Trash2, Plus, Save, UserCog } from 'lucide-react';
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
  'w-full h-9 px-2.5 rounded-md border border-border bg-surface text-sm focus:outline-none focus:border-accent transition-colors';

export default function AgencySettings({ agency, onClose }: { agency: Agency; onClose: () => void }) {
  const rules = useAgencyStore((s) => s.rules);
  const leads = useAgencyStore((s) => s.leads);
  const reloadAll = useAgencyStore((s) => s.reloadAll);
  const reloadEntities = useAgencyStore((s) => s.reloadEntities);

  const [name, setName] = useState(agency.name);
  const [tz, setTz] = useState(agency.source_tz_offset);
  const [percent, setPercent] = useState(String(agency.default_percent));
  const [commission, setCommission] = useState(String(agency.commission_percent));
  const [baseSalary, setBaseSalary] = useState(String(agency.base_salary));
  const [kinds, setKinds] = useState<AgencyPayoutKinds>(parseKinds(agency.payout_kinds));
  const [saving, setSaving] = useState(false);

  const [ruleAmount, setRuleAmount] = useState('');
  const [ruleLabel, setRuleLabel] = useState('');

  const [leadName, setLeadName] = useState('');
  const [leadShare, setLeadShare] = useState('');

  const shareSum = leads.reduce((s, l) => s + (l.share_percent || 0), 0);

  async function saveAgency(): Promise<void> {
    const p = Number(percent);
    const c = Number(commission);
    const b = Number(baseSalary);
    setSaving(true);
    try {
      await api.updateAgency(agency.id, {
        name: name.trim() || agency.name,
        source_tz_offset: tz,
        default_percent: Number.isFinite(p) ? p : agency.default_percent,
        commission_percent: Number.isFinite(c) ? c : agency.commission_percent,
        base_salary: Number.isFinite(b) ? b : agency.base_salary,
        payout_kinds: kinds
      });
      await api.recomputeAgencySales(agency.id);
      await reloadAll();
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

  // ----- Тим-лиды -----
  async function addLead(): Promise<void> {
    const n = leadName.trim();
    if (!n) return;
    const share = Number(leadShare);
    await api.createAgencyLead({
      agency_id: agency.id,
      name: n,
      share_percent: Number.isFinite(share) ? share : 0
    });
    setLeadName('');
    setLeadShare('');
    await reloadEntities();
    useAuth.getState().bumpData();
  }

  async function patchLead(
    id: string,
    body: { name?: string; share_percent?: number; trc20?: string | null }
  ): Promise<void> {
    await api.updateAgencyLead(id, body);
    await reloadEntities();
    useAuth.getState().bumpData();
  }

  async function removeLead(id: string): Promise<void> {
    await api.deleteAgencyLead(id);
    await reloadEntities();
    useAuth.getState().bumpData();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in" onClick={onClose}>
      <div
        className="bg-bg rounded-2xl border border-border w-full max-w-lg max-h-[88vh] flex flex-col shadow-2xl animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <span className="font-semibold text-ink">Настройки агентства</span>
          <button onClick={onClose} className="text-faint hover:text-ink transition-colors">
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
              <span className="block text-[11px] uppercase text-muted mb-1">% чаттера по умолчанию</span>
              <input className={inputCls} value={percent} inputMode="decimal" onChange={(e) => setPercent(e.target.value)} />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-[11px] uppercase text-muted mb-1">% агентства (пул тим-лидов)</span>
              <input className={inputCls} value={commission} inputMode="decimal" placeholder="напр. 5" onChange={(e) => setCommission(e.target.value)} />
            </label>
            <label className="block">
              <span className="block text-[11px] uppercase text-muted mb-1">Ставка агентства, $ (отдельно)</span>
              <input className={inputCls} value={baseSalary} inputMode="decimal" placeholder="напр. 750" onChange={(e) => setBaseSalary(e.target.value)} />
            </label>
          </div>
          <p className="text-[11px] text-faint -mt-2">
            Пул тим-лидов = % агентства × суммарный NET за период. Ставка показывается отдельной строкой и в дележ лидов не входит.
          </p>

          <div>
            <span className="block text-[11px] uppercase text-muted mb-1.5">Что идёт в ЗП чаттеру</span>
            <div className="flex flex-wrap gap-2">
              {KIND_ROWS.map((k) => (
                <label
                  key={k.key}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-sm cursor-pointer transition-colors ${
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

          {/* Тим-лиды */}
          <div>
            <span className="flex items-center gap-1.5 text-[11px] uppercase text-muted mb-1.5">
              <UserCog size={13} /> Тим-лиды (делят пул агентства)
            </span>
            {leads.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {leads.map((l) => (
                  <div key={l.id} className="rounded-md border border-border bg-surface2/50 p-2 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: l.color ?? '#2563EB' }} />
                      <input
                        defaultValue={l.name}
                        onBlur={(e) => e.target.value.trim() !== l.name && void patchLead(l.id, { name: e.target.value.trim() || l.name })}
                        className="flex-1 min-w-0 h-8 px-2 rounded border border-border bg-surface text-sm focus:outline-none focus:border-accent"
                      />
                      <input
                        defaultValue={l.share_percent}
                        inputMode="decimal"
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v) && v !== l.share_percent) void patchLead(l.id, { share_percent: v });
                        }}
                        className="w-16 h-8 px-2 rounded border border-border bg-surface text-sm text-right focus:outline-none focus:border-accent"
                      />
                      <span className="text-xs text-muted">%</span>
                      <button onClick={() => void removeLead(l.id)} className="text-faint hover:text-danger shrink-0">
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <input
                      defaultValue={l.trc20 ?? ''}
                      placeholder="Кошелёк TRC20 (USDT)"
                      onBlur={(e) => (e.target.value.trim() || null) !== (l.trc20 ?? null) && void patchLead(l.id, { trc20: e.target.value.trim() || null })}
                      className="w-full h-8 px-2 rounded border border-border bg-surface text-xs font-mono focus:outline-none focus:border-accent"
                    />
                  </div>
                ))}
                <div className={`text-[11px] ${Math.round(shareSum) === 100 ? 'text-faint' : 'text-amber-500'}`}>
                  Сумма долей: {shareSum}%{Math.round(shareSum) !== 100 ? ' (обычно 100%)' : ''}
                </div>
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void addLead();
              }}
              className="flex gap-2"
            >
              <input
                value={leadName}
                onChange={(e) => setLeadName(e.target.value)}
                placeholder="Имя тим-лида"
                className="h-9 px-2.5 rounded-md border border-border bg-surface text-sm flex-1 min-w-0 focus:outline-none focus:border-accent transition-colors"
              />
              <input
                value={leadShare}
                onChange={(e) => setLeadShare(e.target.value)}
                placeholder="%"
                inputMode="decimal"
                className="h-9 px-2.5 rounded-md border border-border bg-surface text-sm w-16 shrink-0 text-right focus:outline-none focus:border-accent transition-colors"
              />
              <button
                type="submit"
                disabled={!leadName.trim()}
                className="bg-accent text-white px-3 rounded-md text-sm flex items-center gap-1 shrink-0 disabled:opacity-40 hover:brightness-110 transition active:scale-[0.98]"
              >
                <Plus size={15} />
              </button>
            </form>
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
          <button onClick={onClose} className="px-3 h-9 rounded-md text-sm text-muted hover:text-ink transition-colors">
            Закрыть
          </button>
          <button
            onClick={() => void saveAgency()}
            disabled={saving}
            className="bg-accent text-white px-4 h-9 rounded-md text-sm flex items-center gap-1.5 disabled:opacity-50 hover:brightness-110 transition active:scale-[0.98]"
          >
            <Save size={15} /> Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}

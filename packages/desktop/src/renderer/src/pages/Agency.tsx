import { useEffect, useState } from 'react';
import { Plus, Settings as Gear, Building2, Users, ClipboardList, Wallet, X, ChevronDown } from 'lucide-react';
import { SHIFTS } from '@swit/shared';
import { api } from '../api';
import { useAgencyStore } from '../lib/agency';
import { useRealtimeRefetch } from '../hooks/useRealtimeRefetch';
import ModelsBoard from '../components/agency/ModelsBoard';
import ChattersPanel from '../components/agency/ChattersPanel';
import SalesPanel from '../components/agency/SalesPanel';
import PayoutsPanel from '../components/agency/PayoutsPanel';
import AgencySettings from '../components/agency/AgencySettings';

type Tab = 'models' | 'chatters' | 'sales' | 'payouts';

const TABS: { key: Tab; label: string; icon: typeof Users }[] = [
  { key: 'models', label: 'Модели', icon: Building2 },
  { key: 'chatters', label: 'Чаттеры', icon: Users },
  { key: 'sales', label: 'Продажи', icon: ClipboardList },
  { key: 'payouts', label: 'Выплаты', icon: Wallet }
];

export default function Agency() {
  const agencies = useAgencyStore((s) => s.agencies);
  const selectedId = useAgencyStore((s) => s.selectedId);
  const select = useAgencyStore((s) => s.select);
  const reloadAll = useAgencyStore((s) => s.reloadAll);
  const models = useAgencyStore((s) => s.models);
  const chatters = useAgencyStore((s) => s.chatters);
  const assignments = useAgencyStore((s) => s.assignments);

  const [tab, setTab] = useState<Tab>('models');
  const [showSettings, setShowSettings] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void reloadAll().catch(() => {});
  }, [reloadAll]);
  useRealtimeRefetch(() => {
    void reloadAll().catch(() => {});
  });

  const selected = agencies.find((a) => a.id === selectedId) ?? null;

  // Сколько смен моделей без чаттера (для индикатора покрытия).
  const gapCount = models.reduce(
    (acc, m) => acc + SHIFTS.filter((s) => !assignments.some((a) => a.model_id === m.id && a.shift === s)).length,
    0
  );

  function openCreate(): void {
    setCreateName('');
    setShowCreate(true);
  }

  async function submitCreate(): Promise<void> {
    const name = createName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const a = await api.createAgency({ name });
      setCreateName('');
      setShowCreate(false);
      await reloadAll();
      select(a.id);
    } catch {
      /* api-слой уже показал тост */
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="px-6 py-5 max-w-[1200px] mx-auto">
      <div className="flex items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-semibold">
            <span className="grad-accent">Агентства</span>
          </h1>
          <p className="text-sm text-muted mt-0.5">
            Чаттеры, модели, продажи и выплаты — вместо Google-таблицы.
          </p>
        </div>
        {selected && (
          <div className="hidden sm:flex items-center gap-2 text-xs">
            <Stat label="Модели" value={models.length} />
            <Stat label="Чаттеры" value={chatters.filter((c) => c.active).length} />
            <Stat label="Смен без чаттера" value={gapCount} tone={gapCount > 0 ? 'warn' : 'ok'} />
          </div>
        )}
      </div>

      {/* Инлайн-форма создания агентства */}
      {showCreate && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submitCreate();
          }}
          className="flex items-center gap-2 mb-4 max-w-md animate-rise"
        >
          <input
            autoFocus
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setShowCreate(false);
            }}
            placeholder="Название агентства"
            className="flex-1 h-10 px-3 rounded-lg border border-border bg-surface text-sm focus:outline-none focus:border-accent transition-colors"
          />
          <button
            type="submit"
            disabled={!createName.trim() || creating}
            className="bg-accent text-white px-4 h-10 rounded-lg text-sm flex items-center gap-1.5 disabled:opacity-40 hover:brightness-110 transition active:scale-[0.98]"
          >
            <Plus size={16} /> Создать
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(false)}
            className="text-faint hover:text-ink h-10 w-10 flex items-center justify-center transition-colors"
          >
            <X size={18} />
          </button>
        </form>
      )}

      {agencies.length === 0 ? (
        !showCreate && (
          <div className="border border-dashed border-border rounded-2xl py-16 text-center animate-rise bg-gradient-to-b from-surface/40 to-transparent">
            <div className="mx-auto mb-3 w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center">
              <Building2 className="text-accent" size={26} />
            </div>
            <div className="text-ink font-medium mb-1">Пока нет ни одного агентства</div>
            <div className="text-sm text-muted mb-4">Создайте первое агентство, чтобы добавить модели и чаттеров.</div>
            <button
              onClick={openCreate}
              className="bg-accent text-white px-4 h-10 rounded-lg text-sm inline-flex items-center gap-1.5 hover:brightness-110 transition active:scale-[0.98]"
            >
              <Plus size={16} /> Новое агентство
            </button>
          </div>
        )
      ) : (
        <>
          {/* Селектор агентства + действия */}
          <div className="flex items-center gap-2 mb-4">
            <div className="relative">
              <select
                value={selectedId ?? ''}
                onChange={(e) => select(e.target.value)}
                className="h-10 pl-3 pr-9 rounded-lg border border-border bg-surface text-sm font-medium min-w-[200px] appearance-none focus:outline-none focus:border-accent transition-colors lift"
              >
                {agencies.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              <ChevronDown size={15} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
            </div>
            <button
              onClick={openCreate}
              className="h-10 px-3 rounded-lg border border-border bg-surface text-sm text-muted hover:text-ink hover:border-accent/50 transition flex items-center gap-1.5"
              title="Новое агентство"
            >
              <Plus size={15} /> Агентство
            </button>
            {selected && (
              <button
                onClick={() => setShowSettings(true)}
                className="h-10 w-10 rounded-lg border border-border bg-surface text-muted hover:text-ink hover:rotate-45 transition-all duration-300 flex items-center justify-center"
                title="Настройки агентства"
              >
                <Gear size={16} />
              </button>
            )}
          </div>

          {/* Под-вкладки — пилюли с плавным переходом */}
          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-surface2/60 border border-border mb-5">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm transition-all duration-200 ${
                  tab === key
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-muted hover:text-ink hover:bg-surface'
                }`}
              >
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>

          {/* Контент вкладки с анимацией входа при переключении */}
          <div key={tab} className="animate-page">
            {tab === 'models' && <ModelsBoard />}
            {tab === 'chatters' && <ChattersPanel />}
            {tab === 'sales' && <SalesPanel />}
            {tab === 'payouts' && <PayoutsPanel />}
          </div>
        </>
      )}

      {showSettings && selected && (
        <AgencySettings agency={selected} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'warn' }) {
  const valueCls = tone === 'warn' ? 'text-amber-500' : tone === 'ok' ? 'text-emerald-500' : 'text-ink';
  return (
    <div className="px-3 py-1.5 rounded-lg border border-border bg-surface text-center min-w-[78px]">
      <div className={`text-base font-semibold timer-font leading-none ${valueCls}`}>{value}</div>
      <div className="text-[10px] text-muted mt-0.5 uppercase tracking-wide">{label}</div>
    </div>
  );
}

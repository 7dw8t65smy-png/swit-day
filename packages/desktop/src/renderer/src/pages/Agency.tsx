import { useEffect, useState } from 'react';
import { Plus, Settings as Gear, Building2, Users, ClipboardList, Wallet, X } from 'lucide-react';
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

  const [tab, setTab] = useState<Tab>('models');
  const [showSettings, setShowSettings] = useState(false);
  // Создание агентства — инлайн-поле (window.prompt в Electron не поддерживается).
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void reloadAll().catch(() => {
      /* ошибку уже озвучил api-слой; не плодим общий тост */
    });
  }, [reloadAll]);
  useRealtimeRefetch(() => {
    void reloadAll().catch(() => {});
  });

  const selected = agencies.find((a) => a.id === selectedId) ?? null;

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
      <h1 className="text-2xl font-semibold text-ink mb-1">Агентства</h1>
      <p className="text-sm text-muted mb-5">Чаттеры, модели, продажи и выплаты — вместо Google-таблицы.</p>

      {/* Инлайн-форма создания агентства */}
      {showCreate && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submitCreate();
          }}
          className="flex items-center gap-2 mb-4 max-w-md"
        >
          <input
            autoFocus
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setShowCreate(false);
            }}
            placeholder="Название агентства"
            className="flex-1 h-10 px-3 rounded-lg border border-border bg-surface text-sm focus:outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={!createName.trim() || creating}
            className="bg-accent text-white px-4 h-10 rounded-lg text-sm flex items-center gap-1.5 disabled:opacity-40"
          >
            <Plus size={16} /> Создать
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(false)}
            className="text-faint hover:text-ink h-10 w-10 flex items-center justify-center"
          >
            <X size={18} />
          </button>
        </form>
      )}

      {agencies.length === 0 ? (
        !showCreate && (
          <div className="border border-dashed border-border rounded-xl py-16 text-center">
            <Building2 className="mx-auto text-faint mb-3" size={32} />
            <div className="text-ink font-medium mb-1">Пока нет ни одного агентства</div>
            <div className="text-sm text-muted mb-4">Создайте первое агентство, чтобы добавить модели и чаттеров.</div>
            <button
              onClick={openCreate}
              className="bg-accent text-white px-4 h-10 rounded-md text-sm inline-flex items-center gap-1.5"
            >
              <Plus size={16} /> Новое агентство
            </button>
          </div>
        )
      ) : (
        <>
          {/* Селектор агентства + действия */}
          <div className="flex items-center gap-2 mb-4">
            <select
              value={selectedId ?? ''}
              onChange={(e) => select(e.target.value)}
              className="h-10 px-3 rounded-lg border border-border bg-surface text-sm font-medium min-w-[200px]"
            >
              {agencies.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <button
              onClick={openCreate}
              className="h-10 px-3 rounded-lg border border-border bg-surface text-sm text-muted hover:text-ink flex items-center gap-1.5"
              title="Новое агентство"
            >
              <Plus size={15} /> Агентство
            </button>
            {selected && (
              <button
                onClick={() => setShowSettings(true)}
                className="h-10 w-10 rounded-lg border border-border bg-surface text-muted hover:text-ink flex items-center justify-center"
                title="Настройки агентства"
              >
                <Gear size={16} />
              </button>
            )}
          </div>

          {/* Под-вкладки */}
          <div className="flex items-center gap-1 border-b border-border mb-5">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition ${
                  tab === key
                    ? 'border-accent text-accent font-medium'
                    : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>

          {tab === 'models' && <ModelsBoard />}
          {tab === 'chatters' && <ChattersPanel />}
          {tab === 'sales' && <SalesPanel />}
          {tab === 'payouts' && <PayoutsPanel />}
        </>
      )}

      {showSettings && selected && (
        <AgencySettings agency={selected} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}

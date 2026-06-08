import { useEffect, useState } from 'react';
import { Save, Check } from 'lucide-react';
import { api, resetApiUrl } from '../api';
import type { Project } from '@swit/shared';
import { DEFAULT_SETTINGS, useSettings } from '../lib/settings';
import { CATEGORIES } from './settings/constants';
import type { Category, PatchFn } from './settings/types';
import { GeneralPane } from './settings/GeneralPane';
import { AppearancePane } from './settings/AppearancePane';
import { WorkdayPane } from './settings/WorkdayPane';
import { NotificationsPane } from './settings/NotificationsPane';
import { IntegrationsPane } from './settings/IntegrationsPane';
import { DataPane } from './settings/DataPane';
import { AboutPane } from './settings/AboutPane';

// Settings page — left sidebar with categories, right content area.
//
// Reads/writes via the global `useSettings` store, so visual changes (accent,
// density, theme) take effect the moment the user clicks — not after Save.
// Non-visual settings flush to the server on Save.

export default function Settings(): JSX.Element {
  const s = useSettings((st) => st.settings);
  const update = useSettings((st) => st.update);
  const save = useSettings((st) => st.save);
  const replace = useSettings((st) => st.replace);

  const [cat, setCat] = useState<Category>('general');
  const [projects, setProjects] = useState<Project[]>([]);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  const patch: PatchFn = (key, value) => {
    update(key, value);
    setDirty(true);
  };

  useEffect(() => {
    void (async () => {
      const ps = await api.listProjects();
      setProjects(ps);
    })();
  }, []);

  async function onSave(): Promise<void> {
    await save();
    // Apply backend override locally — next requests will use new URL.
    if (s.backend_url.trim()) {
      localStorage.setItem('swit:backend_url', s.backend_url.trim());
      if (s.backend_token.trim()) {
        localStorage.setItem('swit:backend_token', s.backend_token.trim());
      } else {
        localStorage.removeItem('swit:backend_token');
      }
    } else {
      localStorage.removeItem('swit:backend_url');
      localStorage.removeItem('swit:backend_token');
    }
    resetApiUrl();
    setSaved(true);
    setDirty(false);
    setTimeout(() => setSaved(false), 1500);
  }

  async function onResetDefaults(): Promise<void> {
    if (!confirm('Сбросить все настройки к значениям по умолчанию?')) return;
    replace(DEFAULT_SETTINGS);
    await api.setSettings(
      Object.fromEntries(
        Object.entries(DEFAULT_SETTINGS).map(([k, v]) => [
          k,
          typeof v === 'boolean' ? (v ? '1' : '0') : String(v)
        ])
      )
    );
    setSaved(true);
    setDirty(false);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 pt-6 pb-4 border-b border-border bg-surface">
        <div className="flex items-center justify-between max-w-[1100px]">
          <div>
            <h1 className="text-2xl font-semibold">Настройки</h1>
            <div className="text-sm text-muted mt-0.5">Управление приложением SWIT Day</div>
          </div>
          <div className="flex items-center gap-3">
            {saved && (
              <span className="text-sm text-green-600 flex items-center gap-1">
                <Check size={14} /> Сохранено
              </span>
            )}
            <button
              onClick={onSave}
              disabled={!dirty}
              className={`px-4 h-9 rounded-md text-sm font-medium flex items-center gap-1.5 transition ${
                dirty
                  ? 'bg-accent text-white hover:bg-accent-hover shadow-sm'
                  : 'bg-surface2 text-faint cursor-not-allowed'
              }`}
            >
              <Save size={14} /> Сохранить
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <nav className="w-[220px] shrink-0 border-r border-border bg-surface py-4 overflow-y-auto">
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            const active = cat === c.key;
            return (
              <button
                key={c.key}
                onClick={() => setCat(c.key)}
                className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition ${
                  active
                    ? 'bg-accent-light text-accent font-medium border-r-2 border-accent'
                    : 'text-ink hover:bg-surface2'
                }`}
              >
                <Icon size={15} />
                {c.label}
              </button>
            );
          })}
        </nav>

        <main className="flex-1 overflow-y-auto bg-bg">
          <div className="p-6 max-w-[760px]">
            {cat === 'general' && <GeneralPane s={s} patch={patch} />}
            {cat === 'appearance' && <AppearancePane s={s} patch={patch} />}
            {cat === 'workday' && <WorkdayPane s={s} patch={patch} projects={projects} />}
            {cat === 'notifications' && <NotificationsPane s={s} patch={patch} />}
            {cat === 'integrations' && <IntegrationsPane s={s} patch={patch} />}
            {cat === 'data' && <DataPane onResetDefaults={onResetDefaults} />}
            {cat === 'about' && <AboutPane />}
          </div>
        </main>
      </div>
    </div>
  );
}

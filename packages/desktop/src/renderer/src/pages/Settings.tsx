import { useEffect, useRef, useState } from 'react';
import {
  User,
  Palette,
  Briefcase,
  Bell,
  Plug,
  Database,
  Info,
  Sun,
  Moon,
  Monitor,
  Save,
  Check,
  Download,
  Upload,
  RotateCcw,
  Trash2,
  ExternalLink,
  Folder,
  type LucideIcon
} from 'lucide-react';
import { api, notify, resetApiUrl, type BackupInfo } from '../api';
import type { Project } from '@swit/shared';
import { PROJECT_PALETTE } from '../lib/palette';
import { DEFAULT_SETTINGS, useSettings, type AppSettings } from '../lib/settings';
import { localDateKey } from '../lib/date';
import {
  parsePresets,
  serialisePresets,
  formatOffset,
  formatPresetOffsets,
  NONE_PRESET_NAME,
  type ReminderPreset
} from '../lib/reminderPresets';

// Settings page — left sidebar with categories, right content area.
//
// Reads/writes via the global `useSettings` store, so visual changes (accent,
// density, theme) take effect the moment the user clicks — not after Save.
// Non-visual settings flush to the server on Save.

type Category =
  | 'general'
  | 'appearance'
  | 'workday'
  | 'notifications'
  | 'integrations'
  | 'data'
  | 'about';

const PAGES: { value: string; label: string }[] = [
  { value: '/today', label: 'Сегодня' },
  { value: '/tasks', label: 'Задачи' },
  { value: '/habits', label: 'Рутины' },
  { value: '/notes', label: 'Заметки' },
  { value: '/calendar', label: 'Календарь' },
  { value: '/journal', label: 'Журнал' },
  { value: '/stats', label: 'Статистика' }
];

const CATEGORIES: { key: Category; label: string; icon: LucideIcon }[] = [
  { key: 'general', label: 'Общие', icon: User },
  { key: 'appearance', label: 'Внешний вид', icon: Palette },
  { key: 'workday', label: 'Рабочий день', icon: Briefcase },
  { key: 'notifications', label: 'Уведомления', icon: Bell },
  { key: 'integrations', label: 'Интеграции', icon: Plug },
  { key: 'data', label: 'Данные', icon: Database },
  { key: 'about', label: 'О программе', icon: Info }
];

type PatchFn = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;

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

// ============ Panes ============

function GeneralPane({ s, patch }: { s: AppSettings; patch: PatchFn }): JSX.Element {
  return (
    <div className="space-y-5">
      <Section title="Профиль" hint="Имя используется в приветствиях и сводках дня.">
        <Row label="Имя">
          <input
            value={s.user_name}
            onChange={(e) => patch('user_name', e.target.value)}
            placeholder="Никита"
            className="input"
          />
        </Row>
      </Section>

      <Section title="Запуск">
        <Row label="Стартовая страница" hint="Куда открывать приложение при запуске.">
          <select
            value={s.start_page}
            onChange={(e) => patch('start_page', e.target.value)}
            className="input"
          >
            {PAGES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </Row>
        <ToggleRow
          label="Запускать при старте Mac"
          hint="Требует интеграции в main-процесс (app.setLoginItemSettings). Пока сохраняется как намерение."
          value={s.autostart}
          onChange={(v) => patch('autostart', v)}
        />
      </Section>

      <Section title="Окно и трей">
        <ToggleRow
          label="Сворачивать в трей вместо закрытия"
          hint="Требует интеграции в main-процесс. Пока сохраняется как намерение."
          value={s.minimize_to_tray}
          onChange={(v) => patch('minimize_to_tray', v)}
        />
        <ToggleRow
          label="Показывать иконку в menubar"
          value={s.show_tray_icon}
          onChange={(v) => patch('show_tray_icon', v)}
        />
      </Section>

      <Section title="Поведение">
        <ToggleRow
          label="Подтверждать удаление"
          hint="Запрашивать «точно удалить?» перед стиранием задач/заметок/проектов."
          value={s.confirm_delete}
          onChange={(v) => patch('confirm_delete', v)}
        />
      </Section>
    </div>
  );
}

function AppearancePane({ s, patch }: { s: AppSettings; patch: PatchFn }): JSX.Element {
  return (
    <div className="space-y-5">
      <Section title="Тема" hint="Применяется мгновенно.">
        <div className="grid grid-cols-3 gap-2">
          {([
            { v: 'light', label: 'Светлая', Icon: Sun },
            { v: 'dark', label: 'Тёмная', Icon: Moon },
            { v: 'system', label: 'Системная', Icon: Monitor }
          ] as const).map((t) => (
            <button
              key={t.v}
              onClick={() => patch('theme', t.v)}
              className={`flex flex-col items-center gap-2 py-4 rounded-md border transition ${
                s.theme === t.v
                  ? 'border-accent bg-accent-light text-accent'
                  : 'border-border hover:bg-surface2'
              }`}
            >
              <t.Icon size={18} />
              <span className="text-sm">{t.label}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Акцентный цвет" hint="Меняет цвет акцента в кнопках, активных пунктах, выделениях. Применяется мгновенно.">
        <div className="flex flex-wrap gap-2">
          {PROJECT_PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => patch('accent_color', c)}
              className={`w-9 h-9 rounded-md transition ${
                s.accent_color === c ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface' : ''
              }`}
              style={{ background: c }}
              title={c}
            />
          ))}
        </div>
      </Section>

      <Section title="Плотность" hint="Меняет размер шрифта и отступов всего интерфейса. Применяется мгновенно.">
        <div className="grid grid-cols-3 gap-2">
          {(['compact', 'normal', 'spacious'] as const).map((d) => (
            <button
              key={d}
              onClick={() => patch('ui_density', d)}
              className={`px-3 py-2 rounded-md border text-sm transition ${
                s.ui_density === d
                  ? 'border-accent bg-accent-light text-accent'
                  : 'border-border hover:bg-surface2'
              }`}
            >
              {d === 'compact' ? 'Компактно' : d === 'normal' ? 'Обычно' : 'Просторно'}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Поведение списков">
        <ToggleRow
          label="Показывать выполненные задачи"
          hint="Включает их в фильтр «Открытые» по умолчанию."
          value={s.show_completed_tasks}
          onChange={(v) => patch('show_completed_tasks', v)}
        />
        <Row label="Неделя начинается с">
          <div className="flex gap-2">
            {(['mon', 'sun'] as const).map((w) => (
              <button
                key={w}
                onClick={() => patch('week_starts_on', w)}
                className={`px-3 py-1.5 rounded-md text-sm border transition ${
                  s.week_starts_on === w
                    ? 'bg-accent text-white border-accent'
                    : 'border-border hover:bg-surface2'
                }`}
              >
                {w === 'mon' ? 'Понедельника' : 'Воскресенья'}
              </button>
            ))}
          </div>
        </Row>
        <Row label="Валюта" hint="Используется в разделе «Расходы».">
          <div className="flex gap-2">
            {(['RUB', 'USD'] as const).map((c) => (
              <button
                key={c}
                onClick={() => patch('currency', c)}
                className={`px-3 py-1.5 rounded-md text-sm border transition ${
                  s.currency === c
                    ? 'bg-accent text-white border-accent'
                    : 'border-border hover:bg-surface2'
                }`}
              >
                {c === 'RUB' ? '₽ Рубль' : '$ Доллар'}
              </button>
            ))}
          </div>
        </Row>
      </Section>
    </div>
  );
}

function WorkdayPane({
  s,
  patch,
  projects
}: {
  s: AppSettings;
  patch: PatchFn;
  projects: Project[];
}): JSX.Element {
  return (
    <div className="space-y-5">
      <Section title="Часы работы" hint="Используется в напоминаниях о начале/конце дня и в статистике.">
        <Row label="Время начала">
          <input
            type="time"
            value={s.day_start}
            onChange={(e) => patch('day_start', e.target.value)}
            className="input w-40"
          />
        </Row>
        <Row label="Время окончания">
          <input
            type="time"
            value={s.day_end}
            onChange={(e) => patch('day_end', e.target.value)}
            className="input w-40"
          />
        </Row>
        <ToggleRow
          label="Авто-завершить день в указанное время"
          hint="Если день ещё активен — будет автоматически закрыт с подведением итогов. Требует scheduler в main-процессе."
          value={s.auto_end_day}
          onChange={(v) => patch('auto_end_day', v)}
        />
      </Section>

      <Section title="Pomodoro" hint="Длительности фокус-сессий и перерывов в минутах.">
        <Row label="Сессия фокуса">
          <NumberInput
            value={s.pomodoro_work_min}
            onChange={(v) => patch('pomodoro_work_min', v)}
            min={5}
            max={120}
            suffix="мин"
          />
        </Row>
        <Row label="Короткий перерыв">
          <NumberInput
            value={s.pomodoro_break_min}
            onChange={(v) => patch('pomodoro_break_min', v)}
            min={1}
            max={30}
            suffix="мин"
          />
        </Row>
        <Row label="Длинный перерыв">
          <NumberInput
            value={s.pomodoro_long_break_min}
            onChange={(v) => patch('pomodoro_long_break_min', v)}
            min={5}
            max={60}
            suffix="мин"
          />
        </Row>
        <Row label="Длинный перерыв через">
          <NumberInput
            value={s.pomodoro_sessions_before_long}
            onChange={(v) => patch('pomodoro_sessions_before_long', v)}
            min={2}
            max={10}
            suffix="сессий"
          />
        </Row>
      </Section>

      <Section title="Новые задачи" hint="Что подставлять по умолчанию при создании задачи.">
        <Row label="Проект">
          <select
            value={s.default_project_id}
            onChange={(e) => patch('default_project_id', e.target.value)}
            className="input"
          >
            <option value="">Без проекта</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.icon ?? ''} {p.name}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Приоритет">
          <select
            value={s.default_priority}
            onChange={(e) => patch('default_priority', e.target.value as AppSettings['default_priority'])}
            className="input w-40"
          >
            <option value="low">↓ Низкий</option>
            <option value="normal">— Обычный</option>
            <option value="high">↑ Высокий</option>
            <option value="urgent">🔥 Срочный</option>
          </select>
        </Row>
        <Row label="Сложность">
          <select
            value={s.default_difficulty}
            onChange={(e) => patch('default_difficulty', e.target.value as AppSettings['default_difficulty'])}
            className="input w-40"
          >
            <option value="easy">🟢 Лёгкая</option>
            <option value="medium">🟡 Средняя</option>
            <option value="hard">🔴 Сложная</option>
          </select>
        </Row>
      </Section>

      <Section title="Новые события">
        <Row label="Напоминание за">
          <NumberInput
            value={s.default_event_reminder_min}
            onChange={(v) => patch('default_event_reminder_min', v)}
            min={0}
            max={1440}
            suffix="мин до начала"
          />
        </Row>
      </Section>
    </div>
  );
}

function NotificationsPane({ s, patch }: { s: AppSettings; patch: PatchFn }): JSX.Element {
  const disabled = !s.notify_enabled;
  return (
    <div className="space-y-5">
      <Section title="Главный переключатель">
        <ToggleRow
          label="Уведомления включены"
          hint="Master switch. Если выключен — никакие уведомления не приходят, независимо от настроек ниже."
          value={s.notify_enabled}
          onChange={(v) => patch('notify_enabled', v)}
        />
      </Section>

      <Section title="Что показывать" hint="Тонкая настройка по типам уведомлений.">
        <ToggleRow
          label="Рутины"
          hint="Пуши в указанное время для рутин с remind_time."
          value={s.notify_routines}
          onChange={(v) => patch('notify_routines', v)}
          disabled={disabled}
        />
        <ToggleRow
          label="События календаря"
          hint="За N минут до начала события (значение в «Рабочий день»)."
          value={s.notify_events}
          onChange={(v) => patch('notify_events', v)}
          disabled={disabled}
        />
        <ToggleRow
          label="Самостоятельные напоминания"
          hint="Те, что создаёшь на вкладке «Напоминания»."
          value={s.notify_reminders}
          onChange={(v) => patch('notify_reminders', v)}
          disabled={disabled}
        />
        <ToggleRow
          label="Окончание сессии Pomodoro"
          value={s.notify_pomodoro}
          onChange={(v) => patch('notify_pomodoro', v)}
          disabled={disabled}
        />
        <ToggleRow
          label="Начало рабочего дня"
          value={s.notify_day_start}
          onChange={(v) => patch('notify_day_start', v)}
          disabled={disabled}
        />
        <ToggleRow
          label="Окончание рабочего дня"
          value={s.notify_day_end}
          onChange={(v) => patch('notify_day_end', v)}
          disabled={disabled}
        />
      </Section>

      <Section title="Звук">
        <ToggleRow
          label="Звуковое сопровождение"
          value={s.notify_sound}
          onChange={(v) => patch('notify_sound', v)}
          disabled={disabled}
        />
      </Section>

      <PresetsSection s={s} patch={patch} disabled={disabled} />
      <PresetMappingSection s={s} patch={patch} disabled={disabled} />
    </div>
  );
}

// ============ Reminder presets section ============

function PresetsSection({
  s,
  patch,
  disabled
}: {
  s: AppSettings;
  patch: PatchFn;
  disabled: boolean;
}): JSX.Element {
  const presets = parsePresets(s.reminder_presets);

  function commit(next: ReminderPreset[]): void {
    patch('reminder_presets', serialisePresets(next));
  }

  function updatePreset(i: number, p: ReminderPreset): void {
    const next = [...presets];
    next[i] = p;
    commit(next);
  }

  function removePreset(i: number): void {
    if (!confirm(`Удалить пресет «${presets[i]?.name}»?`)) return;
    commit(presets.filter((_, idx) => idx !== i));
  }

  function addPreset(): void {
    const name = prompt('Название нового пресета:', 'Новый');
    if (!name?.trim()) return;
    if (presets.some((p) => p.name === name.trim())) {
      alert('Пресет с таким именем уже есть');
      return;
    }
    commit([...presets, { name: name.trim(), offsets: [0] }]);
  }

  return (
    <Section
      title="Пресеты напоминаний"
      hint={`Пресет — это набор «за сколько до» в минутах. ${NONE_PRESET_NAME} — служебный, всегда есть, не редактируется.`}
    >
      <div className="space-y-3">
        {presets.map((p, i) => (
          <PresetEditor
            key={i}
            preset={p}
            disabled={disabled}
            onChange={(next) => updatePreset(i, next)}
            onRemove={() => removePreset(i)}
          />
        ))}
        <button
          onClick={addPreset}
          disabled={disabled}
          className="text-sm text-accent hover:underline disabled:opacity-40"
        >
          + Добавить пресет
        </button>
      </div>
    </Section>
  );
}

function PresetEditor({
  preset,
  disabled,
  onChange,
  onRemove
}: {
  preset: ReminderPreset;
  disabled: boolean;
  onChange: (p: ReminderPreset) => void;
  onRemove: () => void;
}): JSX.Element {
  // Common offset chips users can toggle. Anything beyond can be added via prompt.
  const COMMON = [0, 5, 15, 30, 60, 180, 360, 720, 1440, 2880];

  function toggleOffset(min: number): void {
    const has = preset.offsets.includes(min);
    const next = has ? preset.offsets.filter((x) => x !== min) : [...preset.offsets, min];
    onChange({ ...preset, offsets: next.sort((a, b) => b - a) });
  }

  function renameMe(): void {
    const next = prompt('Новое имя пресета:', preset.name);
    if (!next?.trim()) return;
    onChange({ ...preset, name: next.trim() });
  }

  function addCustom(): void {
    const raw = prompt('За сколько минут до? (Пример: 90 = за 1ч 30мин)');
    if (!raw) return;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      alert('Введи положительное число');
      return;
    }
    if (preset.offsets.includes(n)) return;
    onChange({ ...preset, offsets: [...preset.offsets, n].sort((a, b) => b - a) });
  }

  return (
    <div className="bg-surface2 rounded-md p-3 space-y-2">
      <div className="flex items-center gap-2">
        <button
          onClick={renameMe}
          disabled={disabled}
          className="text-sm font-medium hover:text-accent transition disabled:opacity-50"
        >
          {preset.name}
        </button>
        <span className="text-[11px] text-muted flex-1">
          {preset.offsets.length === 0
            ? 'без напоминаний'
            : formatPresetOffsets(preset.offsets)}
        </span>
        <button
          onClick={onRemove}
          disabled={disabled}
          className="text-[11px] text-red-500 hover:underline disabled:opacity-40"
        >
          удалить
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {COMMON.map((min) => {
          const active = preset.offsets.includes(min);
          return (
            <button
              key={min}
              onClick={() => toggleOffset(min)}
              disabled={disabled}
              className={`px-2 py-0.5 rounded text-[11px] border transition ${
                active
                  ? 'bg-accent text-white border-accent'
                  : 'bg-surface border-border text-muted hover:bg-surface2'
              } disabled:opacity-40`}
            >
              {formatOffset(min)}
            </button>
          );
        })}
        <button
          onClick={addCustom}
          disabled={disabled}
          className="px-2 py-0.5 rounded text-[11px] border border-dashed border-border text-muted hover:text-accent hover:border-accent disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}

// ============ Mapping: какой пресет для какого источника ============

function PresetMappingSection({
  s,
  patch,
  disabled
}: {
  s: AppSettings;
  patch: PatchFn;
  disabled: boolean;
}): JSX.Element {
  const presets = parsePresets(s.reminder_presets);
  const names = [...presets.map((p) => p.name), NONE_PRESET_NAME];

  return (
    <Section
      title="Куда какой пресет применять"
      hint="Привязка пресета к источнику. Можно менять в любой момент — следующая правка задачи/события подхватит новый пресет."
    >
      <Row label="События календаря">
        <select
          value={s.preset_event}
          onChange={(e) => patch('preset_event', e.target.value)}
          disabled={disabled}
          className="input w-56"
        >
          {names.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </Row>
      <Row label="Рутины (за сколько до remind_time)">
        <select
          value={s.preset_routine}
          onChange={(e) => patch('preset_routine', e.target.value)}
          disabled={disabled}
          className="input w-56"
        >
          {names.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </Row>
      <div className="pt-2 mt-2 border-t border-border" />
      <div className="text-[11px] uppercase text-muted">Задачи по приоритету</div>
      <Row label="🔥 Срочный (urgent)">
        <select
          value={s.preset_task_urgent}
          onChange={(e) => patch('preset_task_urgent', e.target.value)}
          disabled={disabled}
          className="input w-56"
        >
          {names.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </Row>
      <Row label="↑ Высокий (high)">
        <select
          value={s.preset_task_high}
          onChange={(e) => patch('preset_task_high', e.target.value)}
          disabled={disabled}
          className="input w-56"
        >
          {names.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </Row>
      <Row label="— Обычный (normal)">
        <select
          value={s.preset_task_normal}
          onChange={(e) => patch('preset_task_normal', e.target.value)}
          disabled={disabled}
          className="input w-56"
        >
          {names.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </Row>
      <Row label="↓ Низкий (low)">
        <select
          value={s.preset_task_low}
          onChange={(e) => patch('preset_task_low', e.target.value)}
          disabled={disabled}
          className="input w-56"
        >
          {names.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </Row>
    </Section>
  );
}

function IntegrationsPane({ s, patch }: { s: AppSettings; patch: PatchFn }): JSX.Element {
  return (
    <div className="space-y-5">
      <Section
        title="Backend (для VDS)"
        hint="Оставь пустым для локального backend (127.0.0.1:47821). Заполни URL и токен, когда вынесешь сервер на VDS."
      >
        <Row label="URL backend">
          <input
            value={s.backend_url}
            onChange={(e) => patch('backend_url', e.target.value)}
            placeholder="https://swit.example.com"
            className="input"
          />
        </Row>
        <Row label="Bearer token">
          <input
            value={s.backend_token}
            onChange={(e) => patch('backend_token', e.target.value)}
            type="password"
            placeholder="…"
            className="input"
          />
        </Row>
      </Section>

    </div>
  );
}

function DataPane({ onResetDefaults }: { onResetDefaults: () => Promise<void> }): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [backups, setBackups] = useState<BackupInfo[]>([]);

  useEffect(() => {
    void api.listBackups().then(setBackups).catch(() => setBackups([]));
  }, []);

  async function backupNow(): Promise<void> {
    setBusy(true);
    setStatus(null);
    try {
      await api.createBackup();
      setBackups(await api.listBackups());
      setStatus('Резервная копия создана');
    } catch (err) {
      setStatus(`Не удалось создать копию: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function exportAll(): Promise<void> {
    setBusy(true);
    setStatus(null);
    try {
      const data = await api.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `swit-day-export-${localDateKey()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus('Экспорт готов');
    } finally {
      setBusy(false);
    }
  }

  async function importFile(file: File): Promise<void> {
    setBusy(true);
    setStatus(null);
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const result = await api.importData(parsed);
      const imported = Object.values(result.counts).reduce((sum, count) => sum + count, 0);
      const message =
        `Профиль загружен (${imported} записей). Нажмите Command + R, чтобы перезагрузить приложение и увидеть добавленные профили.`;
      setStatus(message);
      notify('SWIT Day', message);
      window.alert(message);
    } catch (err) {
      const message = `Не удалось импортировать файл: ${err instanceof Error ? err.message : String(err)}`;
      setStatus(message);
      window.alert(message);
    } finally {
      if (importInputRef.current) importInputRef.current.value = '';
      setBusy(false);
    }
  }

  async function deleteAllData(): Promise<void> {
    if (!confirm('Удалить все данные SWIT Day? Это действие нельзя отменить.')) return;
    if (!confirm('Точно удалить задачи, проекты, заметки, события, журнал, рутины, финансы и настройки?')) return;
    setBusy(true);
    setStatus(null);
    try {
      const result = await api.resetData();
      const deleted = Object.values(result.counts).reduce((sum, count) => sum + count, 0);
      const message = `Данные удалены (${deleted} записей). Нажмите Command + R, чтобы перезагрузить приложение.`;
      setStatus(message);
      notify('SWIT Day', message);
      window.alert(message);
    } catch (err) {
      const message = `Не удалось удалить данные: ${err instanceof Error ? err.message : String(err)}`;
      setStatus(message);
      window.alert(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Section title="Экспорт и импорт" hint="Сохрани снимок всех данных или восстанови из бэкапа.">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={exportAll}
            disabled={busy}
            className="px-4 h-10 rounded-md border border-border bg-surface text-sm hover:bg-surface2 flex items-center gap-2"
          >
            <Download size={14} /> Экспортировать всё (JSON)
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              if (file) void importFile(file);
            }}
          />
          <button
            onClick={() => importInputRef.current?.click()}
            disabled={busy}
            className="px-4 h-10 rounded-md border border-border bg-surface text-sm hover:bg-surface2 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Upload size={14} /> Импортировать из файла
          </button>
        </div>
        {status && <div className="text-xs text-muted mt-2">{status}</div>}
      </Section>

      <Section
        title="Резервные копии"
        hint="Копия базы снимается автоматически раз в день при запуске. Хранятся последние 14."
      >
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => void backupNow()}
            disabled={busy}
            className="px-4 h-10 rounded-md border border-border bg-surface text-sm hover:bg-surface2 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Save size={14} /> Создать копию сейчас
          </button>
          <span className="text-xs text-muted">
            {backups.length > 0
              ? `Последняя: ${backups[0].date} · всего копий: ${backups.length}`
              : 'Копий пока нет'}
          </span>
        </div>
      </Section>

      <Section title="Хранилище">
        <button
          onClick={async () => {
            const error = await window.swit?.openDataFolder();
            if (error) window.alert(`Не удалось открыть папку: ${error}`);
          }}
          className="px-4 h-10 rounded-md border border-border bg-surface text-sm hover:bg-surface2 flex items-center gap-2"
        >
          <Folder size={14} /> Открыть папку с базой
        </button>
      </Section>

      <Section title="Опасная зона" hint="Действия из этого раздела необратимы.">
        <div className="flex flex-col gap-2">
          <button
            onClick={onResetDefaults}
            className="px-4 h-10 rounded-md border border-amber-300 bg-amber-50 text-amber-800 text-sm hover:bg-amber-100 flex items-center gap-2 self-start"
          >
            <RotateCcw size={14} /> Сбросить настройки к дефолту
          </button>
          <button
            onClick={() => void deleteAllData()}
            disabled={busy}
            className="px-4 h-10 rounded-md border border-red-300 bg-red-50 text-red-700 text-sm hover:bg-red-100 flex items-center gap-2 self-start"
          >
            <Trash2 size={14} /> Удалить все данные
          </button>
        </div>
      </Section>
    </div>
  );
}

function AboutPane(): JSX.Element {
  return (
    <div className="space-y-5">
      <Section title="О приложении">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl bg-accent text-white flex items-center justify-center text-2xl font-bold shadow-sm">
            S
          </div>
          <div>
            <div className="text-lg font-semibold">SWIT Day</div>
            <div className="text-sm text-muted">Персональный планировщик рабочего дня</div>
            <div className="text-xs text-faint mt-1">Версия 0.1.0</div>
          </div>
        </div>
      </Section>

      <Section title="Ссылки">
        <div className="flex flex-col gap-2">
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="text-sm text-accent hover:underline flex items-center gap-1.5"
          >
            <ExternalLink size={13} /> Репозиторий проекта
          </a>
          <button
            onClick={() => alert('Проверка обновлений будет в финальной сборке.')}
            className="text-sm text-accent hover:underline flex items-center gap-1.5 self-start"
          >
            <ExternalLink size={13} /> Проверить обновления
          </button>
        </div>
      </Section>

      <Section title="Технологии">
        <div className="text-xs text-muted">
          Electron · React · TypeScript · Tailwind · SQLite · Fastify
        </div>
      </Section>
    </div>
  );
}

// ============ Building blocks ============

function Section({
  title,
  hint,
  children
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section className="bg-surface rounded-lg shadow-sm border border-border">
      <header className="px-5 py-3 border-b border-border">
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint && <p className="text-[11px] text-muted mt-0.5">{hint}</p>}
      </header>
      <div className="p-5 space-y-3">{children}</div>
    </section>
  );
}

function Row({
  label,
  hint,
  children
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="grid grid-cols-[200px_1fr] items-start gap-3">
      <div className="pt-2">
        <div className="text-sm">{label}</div>
        {hint && <div className="text-[11px] text-muted mt-0.5">{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  onChange,
  disabled
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}): JSX.Element {
  return (
    <div className={`flex items-start gap-3 ${disabled ? 'opacity-40' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className="text-sm">{label}</div>
        {hint && <div className="text-[11px] text-muted mt-0.5">{hint}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => !disabled && onChange(!value)}
        disabled={disabled}
        className={`shrink-0 w-10 h-6 rounded-full transition relative ${
          value ? 'bg-accent' : 'bg-surface2 border border-border'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
            value ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  suffix
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
}): JSX.Element {
  return (
    <div className="inline-flex items-center gap-2">
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="input w-24"
      />
      {suffix && <span className="text-xs text-muted">{suffix}</span>}
    </div>
  );
}

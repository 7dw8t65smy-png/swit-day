import type { AppSettings } from '../../lib/settings';
import {
  parsePresets,
  serialisePresets,
  formatOffset,
  formatPresetOffsets,
  NONE_PRESET_NAME,
  type ReminderPreset
} from '../../lib/reminderPresets';
import type { PatchFn } from './types';
import { Section, Row, ToggleRow } from './ui';

export function NotificationsPane({ s, patch }: { s: AppSettings; patch: PatchFn }): JSX.Element {
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

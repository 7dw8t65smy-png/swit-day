import type { TaskPriority, Task } from '@swit/shared';
import { useSettings, type AppSettings } from './settings';

// Reminder presets: named bundles of "minutes before the event" offsets.
//
// Example:
//   { name: 'Важный', offsets: [60, 0] }  → push 1 hour before AND at the moment
//
// Presets live in app settings as a JSON string (one source of truth, easy to
// edit in the Notifications pane). Each source kind (event/routine/task per
// priority) is mapped to a preset by name.

export interface ReminderPreset {
  name: string;
  offsets: number[]; // sorted descending; minutes before the moment
}

/** The reserved "no notifications" preset — always exists, can't be edited. */
export const NONE_PRESET_NAME = 'Без напоминаний';

export const DEFAULT_PRESETS: ReminderPreset[] = [
  { name: 'Обычный',   offsets: [0] },
  { name: 'Важный',    offsets: [60, 0] },
  { name: 'Критичный', offsets: [1440, 60, 15, 0] }
];

// Serialise / deserialise. Stored as JSON string in settings.reminder_presets.
export function serialisePresets(p: ReminderPreset[]): string {
  return JSON.stringify(p);
}

export function parsePresets(raw: string | undefined): ReminderPreset[] {
  if (!raw) return DEFAULT_PRESETS;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_PRESETS;
    const out: ReminderPreset[] = [];
    for (const p of parsed) {
      if (
        p &&
        typeof p === 'object' &&
        typeof (p as ReminderPreset).name === 'string' &&
        Array.isArray((p as ReminderPreset).offsets)
      ) {
        const presetRaw = p as ReminderPreset;
        const offsets = presetRaw.offsets
          .map((n) => Number(n))
          .filter((n) => Number.isFinite(n) && n >= 0)
          .sort((a, b) => b - a);
        out.push({ name: presetRaw.name, offsets });
      }
    }
    return out.length > 0 ? out : DEFAULT_PRESETS;
  } catch {
    return DEFAULT_PRESETS;
  }
}

/** Returns the offsets array for the preset by name. Empty array for the
 *  "Без напоминаний" sentinel or unknown names. */
export function findPresetOffsets(presets: ReminderPreset[], name: string): number[] {
  if (name === NONE_PRESET_NAME) return [];
  const p = presets.find((p) => p.name === name);
  return p ? p.offsets : [];
}

// ============ Resolution helpers (item → offsets) ============
//
// Each helper takes the AppSettings snapshot and returns offsets for that
// source kind. Caller composes fire_at by subtracting `offset` minutes from
// the source's anchor time.

export function offsetsForTask(task: Task, s: AppSettings): number[] {
  const presets = parsePresets(s.reminder_presets);
  const presetName = presetNameForTask(task.priority, s);
  return findPresetOffsets(presets, presetName);
}

export function presetNameForTask(priority: TaskPriority, s: AppSettings): string {
  switch (priority) {
    case 'urgent':
      return s.preset_task_urgent;
    case 'high':
      return s.preset_task_high;
    case 'normal':
      return s.preset_task_normal;
    case 'low':
      return s.preset_task_low;
  }
}

export function offsetsForEvent(s: AppSettings): number[] {
  return findPresetOffsets(parsePresets(s.reminder_presets), s.preset_event);
}

export function offsetsForRoutine(s: AppSettings): number[] {
  return findPresetOffsets(parsePresets(s.reminder_presets), s.preset_routine);
}

// ============ Snapshot helpers (call outside React) ============

export function getSettingsSnapshot(): AppSettings {
  return useSettings.getState().settings;
}

// ============ Pretty offsets label ============

/** «1 ч», «15 м», «1 д», «в момент». */
export function formatOffset(min: number): string {
  if (min === 0) return 'в момент';
  if (min % 1440 === 0) {
    const d = min / 1440;
    return `${d} д`;
  }
  if (min % 60 === 0) {
    const h = min / 60;
    return `${h} ч`;
  }
  return `${min} м`;
}

/** «1д · 1ч · 15м · в момент» */
export function formatPresetOffsets(offsets: number[]): string {
  if (offsets.length === 0) return '—';
  return offsets.map(formatOffset).join(' · ');
}

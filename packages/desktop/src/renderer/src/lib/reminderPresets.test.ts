import { describe, it, expect } from 'vitest';
import {
  parsePresets,
  findPresetOffsets,
  formatOffset,
  formatPresetOffsets,
  serialisePresets,
  DEFAULT_PRESETS,
  NONE_PRESET_NAME
} from './reminderPresets';
import type { ReminderPreset } from './reminderPresets';

// ---------------------------------------------------------------------------
// parsePresets
// ---------------------------------------------------------------------------

describe('parsePresets', () => {
  it('returns DEFAULT_PRESETS when raw is undefined', () => {
    expect(parsePresets(undefined)).toEqual(DEFAULT_PRESETS);
  });

  it('returns DEFAULT_PRESETS when raw is empty string', () => {
    expect(parsePresets('')).toEqual(DEFAULT_PRESETS);
  });

  it('returns DEFAULT_PRESETS when raw is invalid JSON', () => {
    expect(parsePresets('not-json')).toEqual(DEFAULT_PRESETS);
  });

  it('returns DEFAULT_PRESETS when raw is a JSON non-array', () => {
    expect(parsePresets(JSON.stringify({ name: 'x', offsets: [0] }))).toEqual(DEFAULT_PRESETS);
  });

  it('returns DEFAULT_PRESETS when array is empty after validation', () => {
    expect(parsePresets(JSON.stringify([]))).toEqual(DEFAULT_PRESETS);
  });

  it('parses a valid presets array', () => {
    const input: ReminderPreset[] = [{ name: 'MyPreset', offsets: [30, 0] }];
    const result = parsePresets(JSON.stringify(input));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('MyPreset');
    expect(result[0].offsets).toEqual([30, 0]);
  });

  it('sorts offsets descending', () => {
    const input = [{ name: 'Test', offsets: [0, 15, 60] }];
    const result = parsePresets(JSON.stringify(input));
    expect(result[0].offsets).toEqual([60, 15, 0]);
  });

  it('filters out negative offsets', () => {
    // Note: NaN and Infinity become null in JSON.stringify, and Number(null)===0
    // which passes the filter — only negative values are truly filtered.
    const input = [{ name: 'Test', offsets: [-5, 0, 30] }];
    const result = parsePresets(JSON.stringify(input));
    // -5 filtered, 0 and 30 kept, sorted descending
    expect(result[0].offsets).toEqual([30, 0]);
  });

  it('zero (from JSON-serialised null) is kept as a valid offset', () => {
    // NaN/Infinity → null in JSON → Number(null)===0, which is finite and >=0
    const raw = JSON.stringify([{ name: 'Test', offsets: [null, 30] }]);
    const result = parsePresets(raw);
    expect(result[0].offsets).toEqual([30, 0]);
  });

  it('skips entries missing name or offsets fields', () => {
    const input = [
      { name: 'Valid', offsets: [0] },
      { offsets: [5] },          // missing name
      { name: 'NoOffsets' },     // missing offsets
      null,
      42
    ];
    const result = parsePresets(JSON.stringify(input));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Valid');
  });

  it('returns DEFAULT_PRESETS when all entries are invalid', () => {
    const input = [{ notAPreset: true }];
    expect(parsePresets(JSON.stringify(input))).toEqual(DEFAULT_PRESETS);
  });
});

// ---------------------------------------------------------------------------
// findPresetOffsets
// ---------------------------------------------------------------------------

describe('findPresetOffsets', () => {
  const presets: ReminderPreset[] = [
    { name: 'Обычный',   offsets: [0] },
    { name: 'Важный',    offsets: [60, 0] },
    { name: 'Критичный', offsets: [1440, 60, 15, 0] }
  ];

  it('returns [] for NONE_PRESET_NAME sentinel', () => {
    expect(findPresetOffsets(presets, NONE_PRESET_NAME)).toEqual([]);
  });

  it('returns offsets for a known preset name', () => {
    expect(findPresetOffsets(presets, 'Важный')).toEqual([60, 0]);
  });

  it('returns [] for an unknown preset name', () => {
    expect(findPresetOffsets(presets, 'НеСуществует')).toEqual([]);
  });

  it('returns offsets for "Критичный"', () => {
    expect(findPresetOffsets(presets, 'Критичный')).toEqual([1440, 60, 15, 0]);
  });

  it('returns [] when presets array is empty', () => {
    expect(findPresetOffsets([], 'Обычный')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// formatOffset
// ---------------------------------------------------------------------------

describe('formatOffset', () => {
  it('"в момент" for 0 minutes', () => {
    expect(formatOffset(0)).toBe('в момент');
  });

  it('"1 д" for exactly 1440 minutes', () => {
    expect(formatOffset(1440)).toBe('1 д');
  });

  it('"2 д" for 2880 minutes', () => {
    expect(formatOffset(2880)).toBe('2 д');
  });

  it('"1 ч" for 60 minutes', () => {
    expect(formatOffset(60)).toBe('1 ч');
  });

  it('"3 ч" for 180 minutes', () => {
    expect(formatOffset(180)).toBe('3 ч');
  });

  it('"15 м" for 15 minutes', () => {
    expect(formatOffset(15)).toBe('15 м');
  });

  it('"5 м" for 5 minutes', () => {
    expect(formatOffset(5)).toBe('5 м');
  });

  it('"90 м" for 90 minutes (not a full hour multiple... wait: 90/60=1.5 → not integer → minutes)', () => {
    // 90 % 60 !== 0 → raw minutes label
    expect(formatOffset(90)).toBe('90 м');
  });
});

// ---------------------------------------------------------------------------
// formatPresetOffsets
// ---------------------------------------------------------------------------

describe('formatPresetOffsets', () => {
  it('returns "—" for empty offsets array', () => {
    expect(formatPresetOffsets([])).toBe('—');
  });

  it('formats single offset', () => {
    expect(formatPresetOffsets([0])).toBe('в момент');
  });

  it('joins multiple offsets with " · "', () => {
    expect(formatPresetOffsets([60, 0])).toBe('1 ч · в момент');
  });

  it('formats the Критичный preset offsets', () => {
    expect(formatPresetOffsets([1440, 60, 15, 0])).toBe('1 д · 1 ч · 15 м · в момент');
  });
});

// ---------------------------------------------------------------------------
// serialisePresets / round-trip
// ---------------------------------------------------------------------------

describe('serialisePresets', () => {
  it('serialises to JSON string', () => {
    const presets: ReminderPreset[] = [{ name: 'Test', offsets: [30, 0] }];
    const raw = serialisePresets(presets);
    expect(typeof raw).toBe('string');
    expect(JSON.parse(raw)).toEqual(presets);
  });

  it('round-trips through parsePresets', () => {
    const presets: ReminderPreset[] = [
      { name: 'A', offsets: [60, 0] },
      { name: 'B', offsets: [0] }
    ];
    const raw = serialisePresets(presets);
    expect(parsePresets(raw)).toEqual(presets);
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_PRESETS and NONE_PRESET_NAME constants
// ---------------------------------------------------------------------------

describe('DEFAULT_PRESETS', () => {
  it('has 3 entries', () => {
    expect(DEFAULT_PRESETS).toHaveLength(3);
  });

  it('all entries have name and offsets', () => {
    for (const p of DEFAULT_PRESETS) {
      expect(typeof p.name).toBe('string');
      expect(Array.isArray(p.offsets)).toBe(true);
    }
  });
});

describe('NONE_PRESET_NAME', () => {
  it('is a non-empty string', () => {
    expect(typeof NONE_PRESET_NAME).toBe('string');
    expect(NONE_PRESET_NAME.length).toBeGreaterThan(0);
  });
});

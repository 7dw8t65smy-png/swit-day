import { describe, it, expect } from 'vitest';
import { aggregateJournalByDate, aggregatedJournalArray } from './journalAgg';
import type { JournalEntry } from '@swit/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<JournalEntry> & { id: string; date: string }): JournalEntry {
  return {
    what_done: null,
    reflection: null,
    mood: null,
    total_work_s: null,
    total_pause_s: null,
    tasks_done: 0,
    created_at: `${overrides.date}T10:00:00.000Z`,
    updated_at: `${overrides.date}T10:00:00.000Z`,
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// aggregateJournalByDate
// ---------------------------------------------------------------------------

describe('aggregateJournalByDate', () => {
  it('returns empty map for empty input', () => {
    expect(aggregateJournalByDate([])).toEqual(new Map());
  });

  it('single entry passes through unchanged', () => {
    const entry = makeEntry({
      id: 'e1',
      date: '2024-06-10',
      what_done: 'Worked on feature',
      reflection: 'Good day',
      mood: 4,
      total_work_s: 3600,
      total_pause_s: 600,
      tasks_done: 3
    });
    const map = aggregateJournalByDate([entry]);
    const summary = map.get('2024-06-10');
    expect(summary).toBeDefined();
    expect(summary!.id).toBe('e1');
    expect(summary!.what_done).toBe('Worked on feature');
    expect(summary!.reflection).toBe('Good day');
    expect(summary!.mood).toBe(4);
    expect(summary!.total_work_s).toBe(3600);
    expect(summary!.total_pause_s).toBe(600);
    expect(summary!.tasks_done).toBe(3);
    expect(summary!.entries_count).toBe(1);
  });

  it('sums total_work_s, total_pause_s, tasks_done across entries', () => {
    const entries = [
      makeEntry({ id: 'e1', date: '2024-06-10', total_work_s: 1800, total_pause_s: 300, tasks_done: 2, created_at: '2024-06-10T09:00:00.000Z' }),
      makeEntry({ id: 'e2', date: '2024-06-10', total_work_s: 900,  total_pause_s: 150, tasks_done: 1, created_at: '2024-06-10T14:00:00.000Z' })
    ];
    const summary = aggregateJournalByDate(entries).get('2024-06-10')!;
    expect(summary.total_work_s).toBe(2700);
    expect(summary.total_pause_s).toBe(450);
    expect(summary.tasks_done).toBe(3);
  });

  it('uses mood from the newest entry (by created_at)', () => {
    const entries = [
      makeEntry({ id: 'e1', date: '2024-06-10', mood: 2, created_at: '2024-06-10T09:00:00.000Z' }),
      makeEntry({ id: 'e2', date: '2024-06-10', mood: 5, created_at: '2024-06-10T18:00:00.000Z' })
    ];
    const summary = aggregateJournalByDate(entries).get('2024-06-10')!;
    expect(summary.mood).toBe(5);
    expect(summary.id).toBe('e2');
  });

  it('uses id and timestamps from the newest entry', () => {
    const entries = [
      makeEntry({ id: 'e1', date: '2024-06-10', created_at: '2024-06-10T08:00:00.000Z', updated_at: '2024-06-10T08:30:00.000Z' }),
      makeEntry({ id: 'e2', date: '2024-06-10', created_at: '2024-06-10T20:00:00.000Z', updated_at: '2024-06-10T20:30:00.000Z' })
    ];
    const summary = aggregateJournalByDate(entries).get('2024-06-10')!;
    expect(summary.id).toBe('e2');
    expect(summary.created_at).toBe('2024-06-10T20:00:00.000Z');
    expect(summary.updated_at).toBe('2024-06-10T20:30:00.000Z');
  });

  it('concatenates what_done with session labels for multiple entries', () => {
    const entries = [
      makeEntry({ id: 'e1', date: '2024-06-10', what_done: 'Morning work',  created_at: '2024-06-10T09:00:00.000Z' }),
      makeEntry({ id: 'e2', date: '2024-06-10', what_done: 'Evening work', created_at: '2024-06-10T18:00:00.000Z' })
    ];
    const summary = aggregateJournalByDate(entries).get('2024-06-10')!;
    expect(summary.what_done).toContain('Сессия 1');
    expect(summary.what_done).toContain('Morning work');
    expect(summary.what_done).toContain('Сессия 2');
    expect(summary.what_done).toContain('Evening work');
  });

  it('null what_done entries are skipped in concatenation', () => {
    const entries = [
      makeEntry({ id: 'e1', date: '2024-06-10', what_done: null,          created_at: '2024-06-10T09:00:00.000Z' }),
      makeEntry({ id: 'e2', date: '2024-06-10', what_done: 'Real work',   created_at: '2024-06-10T18:00:00.000Z' })
    ];
    const summary = aggregateJournalByDate(entries).get('2024-06-10')!;
    // Only one non-null → returned as-is (no session labels for single parts)
    expect(summary.what_done).toBe('Real work');
  });

  it('what_done is null when all entries have null what_done', () => {
    const entries = [
      makeEntry({ id: 'e1', date: '2024-06-10', what_done: null, created_at: '2024-06-10T09:00:00.000Z' }),
      makeEntry({ id: 'e2', date: '2024-06-10', what_done: null, created_at: '2024-06-10T18:00:00.000Z' })
    ];
    const summary = aggregateJournalByDate(entries).get('2024-06-10')!;
    expect(summary.what_done).toBeNull();
  });

  it('handles null total_work_s / total_pause_s gracefully (treats as 0)', () => {
    const entries = [
      makeEntry({ id: 'e1', date: '2024-06-10', total_work_s: null, total_pause_s: null })
    ];
    const summary = aggregateJournalByDate(entries).get('2024-06-10')!;
    expect(summary.total_work_s).toBe(0);
    expect(summary.total_pause_s).toBe(0);
  });

  it('groups different dates into separate map entries', () => {
    const entries = [
      makeEntry({ id: 'e1', date: '2024-06-10' }),
      makeEntry({ id: 'e2', date: '2024-06-11' }),
      makeEntry({ id: 'e3', date: '2024-06-10', created_at: '2024-06-10T20:00:00.000Z' })
    ];
    const map = aggregateJournalByDate(entries);
    expect(map.size).toBe(2);
    expect(map.get('2024-06-10')!.entries_count).toBe(2);
    expect(map.get('2024-06-11')!.entries_count).toBe(1);
  });

  it('entries_count reflects the number of entries for the date', () => {
    const entries = [
      makeEntry({ id: 'e1', date: '2024-06-10', created_at: '2024-06-10T08:00:00.000Z' }),
      makeEntry({ id: 'e2', date: '2024-06-10', created_at: '2024-06-10T12:00:00.000Z' }),
      makeEntry({ id: 'e3', date: '2024-06-10', created_at: '2024-06-10T20:00:00.000Z' })
    ];
    const summary = aggregateJournalByDate(entries).get('2024-06-10')!;
    expect(summary.entries_count).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// aggregatedJournalArray
// ---------------------------------------------------------------------------

describe('aggregatedJournalArray', () => {
  it('returns empty array for empty input', () => {
    expect(aggregatedJournalArray([])).toEqual([]);
  });

  it('returns array sorted by date descending (newest first)', () => {
    const entries = [
      makeEntry({ id: 'e1', date: '2024-06-08' }),
      makeEntry({ id: 'e2', date: '2024-06-10' }),
      makeEntry({ id: 'e3', date: '2024-06-09' })
    ];
    const result = aggregatedJournalArray(entries);
    expect(result[0].date).toBe('2024-06-10');
    expect(result[1].date).toBe('2024-06-09');
    expect(result[2].date).toBe('2024-06-08');
  });

  it('returns one entry per date even with multiple source entries', () => {
    const entries = [
      makeEntry({ id: 'e1', date: '2024-06-10', created_at: '2024-06-10T09:00:00.000Z' }),
      makeEntry({ id: 'e2', date: '2024-06-10', created_at: '2024-06-10T18:00:00.000Z' }),
      makeEntry({ id: 'e3', date: '2024-06-11' })
    ];
    const result = aggregatedJournalArray(entries);
    expect(result).toHaveLength(2);
  });
});

import type { JournalEntry } from '@swit/shared';

/**
 * За одну дату теперь может быть несколько записей в журнале (каждое
 * «Завершить день» добавляет новую). Этот хелпер собирает их в одну
 * виртуальную «дневную сводку», чтобы Stats / RightPanel / streak-логика
 * продолжали работать с одной точкой за дату.
 *
 * Правила сведения:
 *   - total_work_s, total_pause_s, tasks_done — суммируются;
 *   - mood — берётся из самой свежей записи (по created_at);
 *   - what_done / reflection — конкатенируются по сессиям с разделителем,
 *     старые → новые, чтобы хронология читалась сверху вниз.
 */
export interface DayJournalSummary {
  id: string; // id самой свежей записи — для навигации/редактирования
  date: string;
  what_done: string | null;
  reflection: string | null;
  mood: number | null;
  total_work_s: number;
  total_pause_s: number;
  tasks_done: number;
  created_at: string; // самой свежей
  updated_at: string; // самой свежей
  entries_count: number;
}

export function aggregateJournalByDate(
  entries: JournalEntry[]
): Map<string, DayJournalSummary> {
  const byDate = new Map<string, JournalEntry[]>();
  for (const e of entries) {
    const arr = byDate.get(e.date) ?? [];
    arr.push(e);
    byDate.set(e.date, arr);
  }
  const result = new Map<string, DayJournalSummary>();
  for (const [date, list] of byDate) {
    // Сортируем по created_at возрастанию для конкатенации текстов в порядке записи.
    const sortedAsc = [...list].sort((a, b) =>
      a.created_at.localeCompare(b.created_at)
    );
    const newest = sortedAsc[sortedAsc.length - 1];
    const what = joinTexts(sortedAsc.map((e) => e.what_done));
    const refl = joinTexts(sortedAsc.map((e) => e.reflection));
    result.set(date, {
      id: newest.id,
      date,
      what_done: what,
      reflection: refl,
      mood: newest.mood,
      total_work_s: sortedAsc.reduce((s, e) => s + (e.total_work_s ?? 0), 0),
      total_pause_s: sortedAsc.reduce((s, e) => s + (e.total_pause_s ?? 0), 0),
      tasks_done: sortedAsc.reduce((s, e) => s + (e.tasks_done ?? 0), 0),
      created_at: newest.created_at,
      updated_at: newest.updated_at,
      entries_count: sortedAsc.length
    });
  }
  return result;
}

export function aggregatedJournalArray(entries: JournalEntry[]): DayJournalSummary[] {
  return Array.from(aggregateJournalByDate(entries).values()).sort((a, b) =>
    b.date.localeCompare(a.date)
  );
}

function joinTexts(texts: (string | null)[]): string | null {
  const parts = texts.filter((t): t is string => !!t && t.trim().length > 0);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return parts.map((p, i) => `— Сессия ${i + 1} —\n${p}`).join('\n\n');
}

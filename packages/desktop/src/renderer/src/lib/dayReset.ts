import type { DayTotals } from '@swit/shared';

const KEY = (date: string) => `swit:dayResetAt:${date}`;

export function getDayResetAt(date: string): string | null {
  return localStorage.getItem(KEY(date));
}

export function setDayResetAt(date: string, iso: string): void {
  localStorage.setItem(KEY(date), iso);
}

export function clearDayResetAt(date: string): void {
  localStorage.removeItem(KEY(date));
}

/**
 * Return a "view" of DayTotals that pretends the day started at resetAt.
 * Old (pre-reset) sessions are filtered out, work_s/break_s/pause_s recomputed.
 * The currently-open segment (if any) is preserved if it started after reset.
 */
export function applyDayReset(totals: DayTotals, resetAt: string | null): DayTotals {
  if (!resetAt) return totals;
  const cutoff = new Date(resetAt).getTime();

  const after = totals.segments.filter(
    (s) => new Date(s.started_at).getTime() >= cutoff
  );

  let work = 0,
    brk = 0,
    pause = 0;
  let openSegment: DayTotals['open_segment'] = null;
  for (const s of after) {
    if (s.ended_at) {
      if (s.type === 'work') work += s.duration_s;
      else if (s.type === 'break') brk += s.duration_s;
      else if (s.type === 'pause') pause += s.duration_s;
    } else {
      openSegment = { type: s.type, started_at: s.started_at };
    }
  }

  const dayStartedAt = after.length > 0 ? after[0].started_at : null;

  return {
    ...totals,
    work_s: work,
    break_s: brk,
    pause_s: pause,
    sessions_count: after.filter((s) => s.type === 'work').length,
    day_started_at: dayStartedAt,
    open_segment: openSegment,
    segments: after
  };
}

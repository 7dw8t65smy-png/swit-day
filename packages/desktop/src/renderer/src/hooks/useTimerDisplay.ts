import { useEffect, useState } from 'react';
import type { DayTotals, SessionType } from '@swit/shared';

export interface TimerDisplay {
  /** Live seconds of the currently open session. Resets when no session is open. */
  sessionSeconds: number;
  /** Day total of work, including any currently-open work session. */
  dayWorkSeconds: number;
  /** Day total of break, including any currently-open break session. */
  dayBreakSeconds: number;
  /** Day total of pause, including any currently-open pause session. */
  dayPauseSeconds: number;
  /** Type of currently open session or null if none. */
  openType: SessionType | null;
}

export function useTimerDisplay(totals: DayTotals | null): TimerDisplay {
  const [, force] = useState(0);
  const open = totals?.open_segment;

  useEffect(() => {
    if (!open) return undefined;
    const id = window.setInterval(() => force((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, [open?.started_at, open?.type]);

  if (!totals) {
    return {
      sessionSeconds: 0,
      dayWorkSeconds: 0,
      dayBreakSeconds: 0,
      dayPauseSeconds: 0,
      openType: null
    };
  }

  const elapsed = open
    ? Math.max(0, Math.floor((Date.now() - new Date(open.started_at).getTime()) / 1000))
    : 0;
  const openType = open?.type ?? null;

  return {
    sessionSeconds: openType ? elapsed : 0,
    dayWorkSeconds: totals.work_s + (openType === 'work' ? elapsed : 0),
    dayBreakSeconds: totals.break_s + (openType === 'break' ? elapsed : 0),
    dayPauseSeconds: totals.pause_s + (openType === 'pause' ? elapsed : 0),
    openType
  };
}

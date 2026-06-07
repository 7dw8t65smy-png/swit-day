import { useEffect, useState } from 'react';
import type { DayTotals } from '@swit/shared';

/**
 * Live work seconds = closed work sessions + elapsed time of currently-open work session.
 * Re-renders every second when a work session is open.
 */
export function useLiveWorkSeconds(totals: DayTotals | null): number {
  const [, force] = useState(0);
  const open = totals?.open_segment;

  useEffect(() => {
    if (!open || open.type !== 'work') return undefined;
    const id = window.setInterval(() => force((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, [open?.started_at, open?.type]);

  if (!totals) return 0;
  let s = totals.work_s;
  if (open && open.type === 'work') {
    s += Math.floor((Date.now() - new Date(open.started_at).getTime()) / 1000);
  }
  return s;
}

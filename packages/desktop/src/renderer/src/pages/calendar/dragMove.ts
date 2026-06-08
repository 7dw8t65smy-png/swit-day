/**
 * Native HTML5 drag-and-drop payload helpers for moving calendar items
 * (events and scheduled tasks) between days.
 *
 * The payload is stashed on a custom dataTransfer MIME type so it never
 * collides with the existing `text/task-id` channel used to schedule an
 * unscheduled task onto a specific hour.
 */

export const CALENDAR_MOVE_MIME = 'application/x-swit-calendar-move';

export type CalendarMoveKind = 'event' | 'task';

export interface CalendarMovePayload {
  kind: CalendarMoveKind;
  id: string;
  /** Current day of the item in 'yyyy-MM-dd' form, to skip same-day drops. */
  fromDate: string;
}

export function encodeMove(payload: CalendarMovePayload): string {
  return JSON.stringify(payload);
}

export function decodeMove(raw: string | null | undefined): CalendarMovePayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CalendarMovePayload>;
    if (
      (parsed.kind === 'event' || parsed.kind === 'task') &&
      typeof parsed.id === 'string' &&
      parsed.id.length > 0 &&
      typeof parsed.fromDate === 'string'
    ) {
      return { kind: parsed.kind, id: parsed.id, fromDate: parsed.fromDate };
    }
  } catch {
    // Malformed payload — treat as no move.
  }
  return null;
}

/** Read a calendar-move payload from a drop/dragover dataTransfer. */
export function readMove(dt: DataTransfer): CalendarMovePayload | null {
  return decodeMove(dt.getData(CALENDAR_MOVE_MIME));
}

/**
 * Dim the dragged source element while a drag is in flight. Uses `opacity`
 * (compositor-friendly) directly on the node so it needs no React state and
 * never triggers a re-render of the calendar grid mid-drag.
 */
export function markDragging(el: HTMLElement | null): void {
  if (el) el.style.opacity = '0.4';
}

/** Restore a previously dimmed drag source. Pair with markDragging on dragEnd. */
export function clearDragging(el: HTMLElement | null): void {
  if (el) el.style.opacity = '';
}

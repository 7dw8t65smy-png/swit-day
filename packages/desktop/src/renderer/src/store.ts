import { create } from 'zustand';
import type {
  DayTimerStatus,
  DayTotals,
  JournalEntry,
  SessionType,
  WorkSession
} from '@swit/shared';
import { api } from './api';
import {
  applyDayReset,
  clearDayResetAt,
  getDayResetAt,
  setDayResetAt
} from './lib/dayReset';
import { localDateKey } from './lib/date';

/**
 * Legacy theme store. New code should use `useSettings` from `lib/settings.ts` —
 * it owns the full app preferences and syncs them with the server. This thin
 * shim is kept so that Sidebar's "moon/sun" button keeps working while we
 * migrate UI bits over.
 */
interface UiState {
  theme: 'light' | 'dark' | 'system';
  setTheme: (t: 'light' | 'dark' | 'system') => void;
}

import { useSettings as _useSettings } from './lib/settings';

export const useUi = create<UiState>((set) => ({
  theme: 'light',
  setTheme: (theme) => {
    set({ theme });
    // Delegate to the new store so persistence + side-effects happen in one place.
    _useSettings.getState().update('theme', theme);
    void _useSettings.getState().save();
  }
}));

interface DayTimerState {
  status: DayTimerStatus;
  active: WorkSession | null;
  /** Raw totals from server for today. */
  rawTotals: DayTotals | null;
  /** Effective totals after applying client-side dayResetAt. Used by UI. */
  totals: DayTotals | null;
  /** Все записи в журнале за сегодня (могут быть несколько). */
  journalsToday: JournalEntry[];
  /** Local marker: ignore sessions before this timestamp when computing display. */
  dayResetAt: string | null;
  activeTaskId: string | null;
  set: (patch: Partial<DayTimerState>) => void;
  refresh: () => Promise<void>;
  start: () => Promise<void>;
  pause: () => Promise<void>;
  startBreak: () => Promise<void>;
  end: () => Promise<void>;
  /** Mark a fresh visual day on the same calendar date and start working. */
  startNewDay: () => Promise<void>;
}

function deriveStatus(
  active: WorkSession | null,
  totals: DayTotals | null,
  journals: JournalEntry[],
  resetAt: string | null
): DayTimerStatus {
  if (active) {
    const activeStart = new Date(active.started_at).getTime();
    if (resetAt && activeStart < new Date(resetAt).getTime()) {
      // Active session is from before the reset — ignore it for status.
    } else {
      if (active.type === 'break') return 'on_break';
      if (active.type === 'pause') return 'paused';
      return 'running';
    }
  }
  // 'finished' когда:
  //   - есть хотя бы одна запись в журнале за сегодня В ТЕКУЩЕМ окне
  //     (после resetAt, если он есть), AND
  //   - после её сохранения не стартовала новая сессия.
  // Берём самую свежую запись — она и закрывает текущий «день».
  const resetTime = resetAt ? new Date(resetAt).getTime() : 0;
  const recent = journals
    .filter((j) => new Date(j.created_at).getTime() >= resetTime)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (recent) {
    const journalTime = new Date(recent.created_at).getTime();
    const lastSegStart = (totals?.segments ?? []).reduce(
      (max, s) => Math.max(max, new Date(s.started_at).getTime()),
      0
    );
    if (lastSegStart <= journalTime) return 'finished';
  }
  const worked = (totals?.work_s ?? 0) + (totals?.break_s ?? 0) + (totals?.pause_s ?? 0);
  if (worked > 0) return 'paused';
  return 'idle';
}

function todayStr(): string {
  return localDateKey();
}

function secondsBetween(startedAt: string, endedAt: string): number {
  return Math.max(
    0,
    Math.floor((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000)
  );
}

function workSessionCount(totals: DayTotals): number {
  return totals.segments.filter((s) => s.type === 'work').length;
}

function withClosedOpenSegment(totals: DayTotals, now: string): DayTotals {
  const open = totals.segments.find((s) => !s.ended_at);
  if (!open) return { ...totals, open_segment: null, sessions_count: workSessionCount(totals) };

  const duration = secondsBetween(open.started_at, now);
  const segments = totals.segments.map((s) =>
    !s.ended_at ? { ...s, ended_at: now, duration_s: duration } : s
  );

  return {
    ...totals,
    work_s: totals.work_s + (open.type === 'work' ? duration : 0),
    break_s: totals.break_s + (open.type === 'break' ? duration : 0),
    pause_s: totals.pause_s + (open.type === 'pause' ? duration : 0),
    open_segment: null,
    sessions_count: segments.filter((s) => s.type === 'work').length,
    segments
  };
}

function withStartedSegment(totals: DayTotals, type: SessionType, now: string): DayTotals {
  const closed = withClosedOpenSegment(totals, now);
  const segments = [
    ...closed.segments,
    { type, started_at: now, ended_at: null, duration_s: 0 }
  ];

  return {
    ...closed,
    open_segment: { type, started_at: now },
    day_started_at: closed.day_started_at ?? now,
    sessions_count: segments.filter((s) => s.type === 'work').length,
    segments
  };
}

export const useDayTimer = create<DayTimerState>((set, get) => ({
  status: 'idle',
  active: null,
  rawTotals: null,
  totals: null,
  journalsToday: [],
  dayResetAt: null,
  activeTaskId: null,

  set: (patch) => set(patch),

  refresh: async () => {
    const today = todayStr();
    const [active, raw, journals] = await Promise.all([
      api.activeSession(),
      api.dayTotals(),
      api.listJournalByDate(today)
    ]);
    // Roll over orphans from yesterday.
    if (active && active.date !== today) {
      await api.stopSession();
      const fresh = await api.dayTotals();
      const resetAt = getDayResetAt(today);
      const effective = applyDayReset(fresh, resetAt);
      set({
        status: deriveStatus(null, effective, journals, resetAt),
        active: null,
        rawTotals: fresh,
        totals: effective,
        journalsToday: journals,
        dayResetAt: resetAt
      });
      return;
    }
    const resetAt = getDayResetAt(today);
    const effective = applyDayReset(raw, resetAt);
    // If the active session is from before resetAt, treat as null for UI
    const activeForUi =
      active && resetAt && new Date(active.started_at).getTime() < new Date(resetAt).getTime()
        ? null
        : active;
    set({
      status: deriveStatus(activeForUi, effective, journals, resetAt),
      active: activeForUi,
      rawTotals: raw,
      totals: effective,
      journalsToday: journals,
      dayResetAt: resetAt,
      activeTaskId: activeForUi?.task_id ?? get().activeTaskId
    });
  },

  start: async () => {
    const now = new Date().toISOString();
    const optimistic: WorkSession = {
      id: 'optimistic',
      date: todayStr(),
      started_at: now,
      ended_at: null,
      type: 'work',
      task_id: null,
      notes: null
    };
    set({ status: 'running', active: optimistic });
    const t = get().totals;
    if (t) {
      set({ totals: withStartedSegment(t, 'work', now) });
    }
    await api.startSession('work');
    await get().refresh();
  },

  pause: async () => {
    const now = new Date().toISOString();
    const optimistic: WorkSession = {
      id: 'optimistic',
      date: todayStr(),
      started_at: now,
      ended_at: null,
      type: 'pause',
      task_id: null,
      notes: null
    };
    set({ status: 'paused', active: optimistic });
    const t = get().totals;
    if (t) {
      set({ totals: withStartedSegment(t, 'pause', now) });
    }
    await api.startSession('pause');
    await get().refresh();
  },

  startBreak: async () => {
    const now = new Date().toISOString();
    const optimistic: WorkSession = {
      id: 'optimistic',
      date: todayStr(),
      started_at: now,
      ended_at: null,
      type: 'break',
      task_id: null,
      notes: null
    };
    set({ status: 'on_break', active: optimistic });
    const t = get().totals;
    if (t) {
      set({ totals: withStartedSegment(t, 'break', now) });
    }
    await api.startSession('break');
    await get().refresh();
  },

  end: async () => {
    const cur = get();
    const now = new Date().toISOString();
    if (cur.totals) {
      set({
        active: null,
        totals: withClosedOpenSegment(cur.totals, now)
      });
    }
    await api.stopSession();
    await get().refresh();
  },

  startNewDay: async () => {
    const today = todayStr();
    // Mark a fresh visual day boundary.
    const now = new Date().toISOString();
    setDayResetAt(today, now);
    // Stop any open server-side session first.
    await api.stopSession();
    // Reload everything; the new day will see no prior segments and start fresh.
    await get().refresh();
    // Now actually start the new work session.
    await get().start();
  }
}));

export { clearDayResetAt };

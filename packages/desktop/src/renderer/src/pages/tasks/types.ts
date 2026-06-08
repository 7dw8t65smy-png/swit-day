import type { Task } from '@swit/shared';

export type ViewMode = 'board' | 'list';
export type Filter = 'open' | 'today' | 'all' | 'done';

export interface TaskStats {
  remaining: number;
  doneToday: number;
  doneTodayTasks: Task[];
  overdue: number;
  urgent: number;
  dueToday: number;
}

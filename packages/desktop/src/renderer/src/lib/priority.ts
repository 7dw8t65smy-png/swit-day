import type { TaskPriority } from '@swit/shared';

export const PRIORITIES: TaskPriority[] = ['urgent', 'high', 'normal', 'low'];

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  urgent: 'Срочный',
  high: 'Высокий',
  normal: 'Обычный',
  low: 'Низкий'
};

export const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3
};

export const PRIORITY_COLOR: Record<TaskPriority, string> = {
  urgent: '#DC2626',
  high: '#EA580C',
  normal: '#6B7280',
  low: '#9CA3AF'
};

export function sortByPriority<T extends { priority: TaskPriority; sort_order: number }>(
  arr: T[]
): T[] {
  return [...arr].sort((a, b) => {
    const w = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
    return w !== 0 ? w : a.sort_order - b.sort_order;
  });
}

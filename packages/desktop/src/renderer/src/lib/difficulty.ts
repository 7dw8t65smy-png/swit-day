import type { TaskDifficulty } from '@swit/shared';

export const DIFFICULTIES: TaskDifficulty[] = ['easy', 'medium', 'hard'];

export const DIFFICULTY_LABEL: Record<TaskDifficulty, string> = {
  easy: 'Лёгкая',
  medium: 'Средняя',
  hard: 'Сложная'
};

export const DIFFICULTY_ICON: Record<TaskDifficulty, string> = {
  easy: '🟢',
  medium: '🟡',
  hard: '🔴'
};

export const DIFFICULTY_COLOR: Record<TaskDifficulty, string> = {
  easy: '#10B981',
  medium: '#F59E0B',
  hard: '#EF4444'
};

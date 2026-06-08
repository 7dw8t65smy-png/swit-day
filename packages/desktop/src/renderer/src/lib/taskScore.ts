import type { Task } from '@swit/shared';

const PRIORITY_W: Record<Task['priority'], number> = {
  urgent: 10,
  high: 6,
  normal: 3,
  low: 1
};

const DIFFICULTY_W: Record<NonNullable<Task['difficulty']>, number> = {
  easy: 6, // easier = boosted (quick wins)
  medium: 3,
  hard: 1
};

export interface ScoredTask {
  task: Task;
  score: number;
  reason: string;
}

export function scoreTask(task: Task, today: string): ScoredTask {
  let score = PRIORITY_W[task.priority] + DIFFICULTY_W[task.difficulty ?? 'medium'];
  const reasonParts: string[] = [];

  // Due date weighting
  if (task.due_date) {
    if (task.due_date < today) {
      score += 12;
      reasonParts.push('просрочена');
    } else if (task.due_date === today) {
      score += 8;
      reasonParts.push('сегодня дедлайн');
    } else {
      const days = Math.ceil(
        (new Date(task.due_date).getTime() - new Date(today).getTime()) / 86_400_000
      );
      if (days <= 3) {
        score += 3;
        reasonParts.push(`до дедлайна ${days} дн`);
      } else if (days <= 7) {
        score += 1;
      }
    }
  }

  // Priority labels
  if (task.priority === 'urgent') reasonParts.push('срочно');
  else if (task.priority === 'high') reasonParts.push('важно');

  // Difficulty labels
  const diff = task.difficulty ?? 'medium';
  if (diff === 'easy') reasonParts.unshift('лёгкая');
  else if (diff === 'hard') reasonParts.unshift('сложная');

  // De-prioritize hard + low-importance combos
  if (diff === 'hard' && (task.priority === 'low' || task.priority === 'normal')) {
    score -= 3;
  }

  return {
    task,
    score,
    reason: reasonParts.length > 0 ? reasonParts.join(' · ') : 'обычная задача'
  };
}

/**
 * Pick top suggested tasks. Open tasks only, optionally biased to project.
 */
export function suggestTasks(
  tasks: Task[],
  today: string,
  excludeIds: Set<string> = new Set(),
  limit = 5
): ScoredTask[] {
  return tasks
    .filter((t) => t.status !== 'done' && t.status !== 'cancelled' && !excludeIds.has(t.id))
    .map((t) => scoreTask(t, today))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

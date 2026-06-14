import { describe, it, expect } from 'vitest';
import { scoreTask, suggestTasks } from './taskScore';
import type { Task } from '@swit/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Test task',
    description: null,
    project_id: null,
    parent_task_id: null,
    status: 'pending',
    priority: 'normal',
    difficulty: 'medium',
    due_date: null,
    due_time: null,
    estimated_min: null,
    tags: null,
    sort_order: 0,
    created_at: '2024-06-01T00:00:00.000Z',
    updated_at: '2024-06-01T00:00:00.000Z',
    completed_at: null,
    assignee_id: null,
    ...overrides
  };
}

const TODAY = '2024-06-10';

// ---------------------------------------------------------------------------
// scoreTask — base score (priority + difficulty)
// ---------------------------------------------------------------------------

describe('scoreTask base scores', () => {
  it('urgent + easy has highest base score', () => {
    const t = makeTask({ priority: 'urgent', difficulty: 'easy' });
    // urgent=10, easy=6 → base=16
    expect(scoreTask(t, TODAY).score).toBe(16);
  });

  it('urgent + medium base score', () => {
    const t = makeTask({ priority: 'urgent', difficulty: 'medium' });
    expect(scoreTask(t, TODAY).score).toBe(13);
  });

  it('high + easy base score', () => {
    const t = makeTask({ priority: 'high', difficulty: 'easy' });
    expect(scoreTask(t, TODAY).score).toBe(12);
  });

  it('normal + medium base score', () => {
    const t = makeTask({ priority: 'normal', difficulty: 'medium' });
    expect(scoreTask(t, TODAY).score).toBe(6);
  });

  it('low + hard base score (with de-prioritisation)', () => {
    // low=1, hard=1 → base=2, then -3 for hard+low → -1
    const t = makeTask({ priority: 'low', difficulty: 'hard' });
    expect(scoreTask(t, TODAY).score).toBe(-1);
  });

  it('normal + hard score (with de-prioritisation)', () => {
    // normal=3, hard=1 → base=4, then -3 → 1
    const t = makeTask({ priority: 'normal', difficulty: 'hard' });
    expect(scoreTask(t, TODAY).score).toBe(1);
  });

  it('high + hard has no de-prioritisation penalty', () => {
    // high=6, hard=1 → base=7; de-prioritisation only applies to low/normal
    const t = makeTask({ priority: 'high', difficulty: 'hard' });
    expect(scoreTask(t, TODAY).score).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// scoreTask — due date weighting
// ---------------------------------------------------------------------------

describe('scoreTask due date weighting', () => {
  it('adds 12 for overdue task', () => {
    const t = makeTask({ priority: 'normal', difficulty: 'medium', due_date: '2024-06-09' });
    // base=6, overdue+12=18
    expect(scoreTask(t, TODAY).score).toBe(18);
  });

  it('adds 8 for task due today', () => {
    const t = makeTask({ priority: 'normal', difficulty: 'medium', due_date: TODAY });
    expect(scoreTask(t, TODAY).score).toBe(14);
  });

  it('adds 3 for task due within 3 days', () => {
    const t = makeTask({ priority: 'normal', difficulty: 'medium', due_date: '2024-06-12' }); // 2 days out
    expect(scoreTask(t, TODAY).score).toBe(9);
  });

  it('adds 1 for task due within 7 days (4-7 days)', () => {
    const t = makeTask({ priority: 'normal', difficulty: 'medium', due_date: '2024-06-14' }); // 4 days
    expect(scoreTask(t, TODAY).score).toBe(7);
  });

  it('adds 0 for task due more than 7 days away', () => {
    const t = makeTask({ priority: 'normal', difficulty: 'medium', due_date: '2024-06-20' }); // 10 days
    expect(scoreTask(t, TODAY).score).toBe(6);
  });

  it('no due date adds no bonus', () => {
    const t = makeTask({ priority: 'normal', difficulty: 'medium', due_date: null });
    expect(scoreTask(t, TODAY).score).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// scoreTask — null/default difficulty
// ---------------------------------------------------------------------------

describe('scoreTask difficulty defaults', () => {
  it('treats null difficulty as medium', () => {
    const t = makeTask({ priority: 'normal', difficulty: undefined as unknown as Task['difficulty'] });
    // null → medium (3); normal(3) + medium(3) = 6
    const scored = scoreTask({ ...t, difficulty: null as unknown as Task['difficulty'] }, TODAY);
    expect(scored.score).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// scoreTask — reason string
// ---------------------------------------------------------------------------

describe('scoreTask reason string', () => {
  it('contains "срочно" for urgent priority', () => {
    const t = makeTask({ priority: 'urgent', difficulty: 'medium' });
    expect(scoreTask(t, TODAY).reason).toContain('срочно');
  });

  it('contains "важно" for high priority', () => {
    const t = makeTask({ priority: 'high', difficulty: 'medium' });
    expect(scoreTask(t, TODAY).reason).toContain('важно');
  });

  it('contains "лёгкая" for easy difficulty', () => {
    const t = makeTask({ priority: 'normal', difficulty: 'easy' });
    expect(scoreTask(t, TODAY).reason).toContain('лёгкая');
  });

  it('contains "сложная" for hard difficulty', () => {
    const t = makeTask({ priority: 'normal', difficulty: 'hard' });
    expect(scoreTask(t, TODAY).reason).toContain('сложная');
  });

  it('contains "просрочена" for overdue task', () => {
    const t = makeTask({ due_date: '2024-06-09' });
    expect(scoreTask(t, TODAY).reason).toContain('просрочена');
  });

  it('contains "сегодня дедлайн" for task due today', () => {
    const t = makeTask({ due_date: TODAY });
    expect(scoreTask(t, TODAY).reason).toContain('сегодня дедлайн');
  });

  it('returns "обычная задача" when no distinguishing properties', () => {
    const t = makeTask({ priority: 'normal', difficulty: 'medium', due_date: null });
    expect(scoreTask(t, TODAY).reason).toBe('обычная задача');
  });
});

// ---------------------------------------------------------------------------
// suggestTasks
// ---------------------------------------------------------------------------

describe('suggestTasks', () => {
  it('returns empty array for empty input', () => {
    expect(suggestTasks([], TODAY)).toEqual([]);
  });

  it('excludes done tasks', () => {
    const tasks = [makeTask({ id: 't1', status: 'done' })];
    expect(suggestTasks(tasks, TODAY)).toHaveLength(0);
  });

  it('excludes cancelled tasks', () => {
    const tasks = [makeTask({ id: 't1', status: 'cancelled' })];
    expect(suggestTasks(tasks, TODAY)).toHaveLength(0);
  });

  it('includes pending and active tasks', () => {
    const tasks = [
      makeTask({ id: 't1', status: 'pending' }),
      makeTask({ id: 't2', status: 'active' }),
      makeTask({ id: 't3', status: 'paused' })
    ];
    expect(suggestTasks(tasks, TODAY)).toHaveLength(3);
  });

  it('excludes tasks in excludeIds set', () => {
    const tasks = [
      makeTask({ id: 't1', status: 'pending' }),
      makeTask({ id: 't2', status: 'pending' })
    ];
    const result = suggestTasks(tasks, TODAY, new Set(['t1']));
    expect(result).toHaveLength(1);
    expect(result[0].task.id).toBe('t2');
  });

  it('sorts by score descending', () => {
    const tasks = [
      makeTask({ id: 't1', priority: 'low', difficulty: 'medium' }),    // score=4
      makeTask({ id: 't2', priority: 'urgent', difficulty: 'easy' }),   // score=16
      makeTask({ id: 't3', priority: 'normal', difficulty: 'medium' })  // score=6
    ];
    const result = suggestTasks(tasks, TODAY);
    expect(result[0].task.id).toBe('t2');
    expect(result[1].task.id).toBe('t3');
    expect(result[2].task.id).toBe('t1');
  });

  it('respects limit parameter', () => {
    const tasks = Array.from({ length: 10 }, (_, i) =>
      makeTask({ id: `t${i}`, status: 'pending' })
    );
    expect(suggestTasks(tasks, TODAY, new Set(), 3)).toHaveLength(3);
  });

  it('default limit is 5', () => {
    const tasks = Array.from({ length: 10 }, (_, i) =>
      makeTask({ id: `t${i}`, status: 'pending' })
    );
    expect(suggestTasks(tasks, TODAY)).toHaveLength(5);
  });

  it('overdue tasks rank higher than non-overdue of same priority', () => {
    const tasks = [
      makeTask({ id: 'normal', priority: 'normal', difficulty: 'medium', due_date: null }),
      makeTask({ id: 'overdue', priority: 'normal', difficulty: 'medium', due_date: '2024-06-09' })
    ];
    const result = suggestTasks(tasks, TODAY);
    expect(result[0].task.id).toBe('overdue');
  });
});

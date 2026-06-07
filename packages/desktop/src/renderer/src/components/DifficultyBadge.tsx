import type { TaskDifficulty } from '@swit/shared';
import { DIFFICULTY_COLOR, DIFFICULTY_LABEL } from '../lib/difficulty';

export default function DifficultyBadge({ difficulty }: { difficulty: TaskDifficulty }) {
  if (difficulty === 'medium') return null;
  const color = DIFFICULTY_COLOR[difficulty];
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: color + '20', color }}
      title={DIFFICULTY_LABEL[difficulty]}
    >
      {DIFFICULTY_LABEL[difficulty]}
    </span>
  );
}

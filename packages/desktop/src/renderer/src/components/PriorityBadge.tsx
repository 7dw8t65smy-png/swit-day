import type { TaskPriority } from '@swit/shared';
import { PRIORITY_COLOR, PRIORITY_LABEL } from '../lib/priority';

export default function PriorityBadge({ priority }: { priority: TaskPriority }) {
  if (priority === 'normal') return null;
  const color = PRIORITY_COLOR[priority];
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: color + '20', color }}
    >
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

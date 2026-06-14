import { useAuth } from '../lib/auth';

// Подпись назначенной задачи: цветная точка + имя участника. Если назначено
// текущему пользователю — помечаем «вам». Цвет берётся из профиля участника.
export function AssigneeBadge({
  assigneeId,
  compact
}: {
  assigneeId: string | null | undefined;
  compact?: boolean;
}): JSX.Element | null {
  const members = useAuth((s) => s.members);
  const meId = useAuth((s) => s.user?.id);
  if (!assigneeId) return null;

  const m = members.find((x) => x.user_id === assigneeId);
  const name = m?.display_name || m?.handle || 'участник';
  const color = m?.color || '#94A3B8';
  const isMe = assigneeId === meId;
  const label = compact ? (isMe ? 'Вы' : name.split(' ')[0]) : isMe ? `${name} · вам` : name;

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: `${color}1f`, color }}
      title={isMe ? `${name} (назначено вам)` : `Назначено: ${name}`}
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

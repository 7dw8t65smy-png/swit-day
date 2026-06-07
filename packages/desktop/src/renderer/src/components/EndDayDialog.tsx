import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { DayTotals, JournalEntry, Project, Task } from '@swit/shared';
import Modal from './Modal';
import { fmtHM, fmtClock } from '../lib/format';
import { buildAutoSummary, mergeWithUserText } from '../lib/autoSummary';

const MOODS: { value: number; emoji: string; label: string }[] = [
  { value: 1, emoji: '😞', label: 'Плохо' },
  { value: 2, emoji: '😕', label: 'Так себе' },
  { value: 3, emoji: '😐', label: 'Норм' },
  { value: 4, emoji: '🙂', label: 'Хорошо' },
  { value: 5, emoji: '😄', label: 'Отлично' }
];

interface Props {
  open: boolean;
  totals: DayTotals | null;
  liveWorkSeconds: number;
  liveBreakSeconds: number;
  livePauseSeconds: number;
  tasksDone: number;
  /** Существующие записи журнала за сегодня (для контекста). Не префиллят форму
   *  — каждое «Завершить день» сохраняется как новая запись. */
  previousEntries: JournalEntry[];
  initialWhatDone: string;
  doneTasks: Task[];
  projects: Project[];
  date: string;
  onClose: () => void;
  onConfirm: (data: {
    mood: number | null;
    what_done: string;
    reflection: string;
    total_work_s: number;
    total_pause_s: number;
    tasks_done: number;
  }) => Promise<void>;
}

export default function EndDayDialog({
  open,
  totals,
  liveWorkSeconds,
  liveBreakSeconds,
  livePauseSeconds,
  tasksDone,
  previousEntries,
  initialWhatDone,
  doneTasks,
  projects,
  date,
  onClose,
  onConfirm
}: Props) {
  const [mood, setMood] = useState<number | null>(null);
  const [whatDone, setWhatDone] = useState('');
  const [reflection, setReflection] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Не префиллим из предыдущих записей — каждое завершение это новая сессия.
    setMood(null);
    setReflection('');
    const user = initialWhatDone ?? '';
    if (!user.trim()) {
      setWhatDone(buildAutoSummary(doneTasks, projects, date));
    } else {
      setWhatDone(user);
    }
  }, [open, initialWhatDone, doneTasks, projects, date]);

  function regenerateAutoSummary() {
    const auto = buildAutoSummary(doneTasks, projects, date);
    setWhatDone((cur) => mergeWithUserText(auto, cur));
  }

  async function save() {
    setSaving(true);
    try {
      await onConfirm({
        mood,
        what_done: whatDone.trim(),
        reflection: reflection.trim(),
        total_work_s: liveWorkSeconds,
        total_pause_s: livePauseSeconds + liveBreakSeconds,
        tasks_done: tasksDone
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Завершить день"
      wide
      footer={
        <>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-sm border border-border"
            disabled={saving}
          >
            Отмена
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-1.5 rounded-md text-sm bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {saving ? 'Сохраняем...' : 'Сохранить и завершить'}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {previousEntries.length > 0 && (
          <div className="text-xs bg-surface2 border border-border rounded-md px-3 py-2 text-muted">
            Сегодня уже было {previousEntries.length} завершени{previousEntries.length === 1 ? 'е' : 'й'} дня.
            Эта запись будет {previousEntries.length + 1}-й и добавится в журнал отдельно.
          </div>
        )}
        <div className="grid grid-cols-4 gap-3">
          <SummaryCell label="Чистая работа" value={fmtHM(liveWorkSeconds)} accent="work" />
          <SummaryCell label="Паузы" value={fmtHM(livePauseSeconds)} accent="pause" />
          <SummaryCell label="Перерывы" value={fmtHM(liveBreakSeconds)} accent="break" />
          <SummaryCell
            label="Начал в"
            value={fmtClock(totals?.day_started_at ?? null)}
          />
          <SummaryCell label="Сессий" value={String(totals?.sessions_count ?? 0)} />
          <SummaryCell label="Задач готово" value={String(tasksDone)} />
        </div>

        <div>
          <label className="text-xs uppercase text-muted">Как день?</label>
          <div className="flex gap-2 mt-2">
            {MOODS.map((m) => (
              <button
                key={m.value}
                onClick={() => setMood(m.value)}
                title={m.label}
                className={`flex-1 py-3 rounded-md border text-2xl transition ${
                  mood === m.value
                    ? 'border-accent bg-accent-light'
                    : 'border-border hover:bg-surface2'
                }`}
              >
                {m.emoji}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="text-xs uppercase text-muted">Что сделано</label>
            <button
              onClick={regenerateAutoSummary}
              type="button"
              className="text-xs text-accent hover:text-accent-hover flex items-center gap-1"
              title="Собрать сводку из готовых задач за день"
            >
              <Sparkles size={12} /> Авто-сводка ({doneTasks.filter((t) => t.completed_at?.startsWith(date)).length})
            </button>
          </div>
          <textarea
            value={whatDone}
            onChange={(e) => setWhatDone(e.target.value)}
            rows={6}
            placeholder="Главное за день..."
            className="w-full mt-1 p-3 rounded-md border border-border bg-surface text-sm focus:outline-none focus:border-accent resize-none font-mono"
          />
        </div>

        <div>
          <label className="text-xs uppercase text-muted">Рефлексия</label>
          <textarea
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            rows={3}
            placeholder="Что хорошо, что можно улучшить..."
            className="w-full mt-1 p-3 rounded-md border border-border bg-surface text-sm focus:outline-none focus:border-accent resize-none"
          />
        </div>
      </div>
    </Modal>
  );
}

function SummaryCell({
  label,
  value,
  accent
}: {
  label: string;
  value: string;
  accent?: 'work' | 'pause' | 'break';
}) {
  const color =
    accent === 'work'
      ? 'var(--color-work)'
      : accent === 'pause'
        ? 'var(--color-pause)'
        : accent === 'break'
          ? 'var(--color-break)'
          : undefined;
  return (
    <div className="bg-surface2 rounded-md p-3">
      <div className="text-[11px] uppercase text-muted">{label}</div>
      <div
        className="text-lg font-semibold timer-font mt-0.5"
        style={color ? { color } : undefined}
      >
        {value}
      </div>
    </div>
  );
}

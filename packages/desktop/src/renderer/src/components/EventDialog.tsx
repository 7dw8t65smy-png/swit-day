import { useEffect, useState } from 'react';
import type { CalendarEvent, CalendarEventType, Project } from '@swit/shared';
import Modal from './Modal';
import { PROJECT_PALETTE } from '../lib/palette';
import { useSettings } from '../lib/settings';

interface Props {
  open: boolean;
  date: string;
  event: CalendarEvent | null;
  projects: Project[];
  onClose: () => void;
  onSave: (data: Partial<CalendarEvent>) => Promise<void>;
  onDelete?: () => Promise<void>;
}

const TYPES: { value: CalendarEventType; label: string }[] = [
  { value: 'event', label: 'Событие' },
  { value: 'reminder', label: 'Напоминание' },
  { value: 'deadline', label: 'Дедлайн' }
];

export default function EventDialog({
  open,
  date,
  event,
  projects,
  onClose,
  onSave,
  onDelete
}: Props) {
  const defaultReminderMin = useSettings((s) => s.settings.default_event_reminder_min);
  const [title, setTitle] = useState('');
  const [eventDate, setEventDate] = useState(date);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<CalendarEventType>('event');
  const [projectId, setProjectId] = useState<string>('');
  const [color, setColor] = useState<string>(PROJECT_PALETTE[0]);
  const [reminderMin, setReminderMin] = useState<string>('');
  const [allDay, setAllDay] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(event?.title ?? '');
    setEventDate(event?.date ?? date);
    setStartTime(event?.start_time ?? '');
    setEndTime(event?.end_time ?? '');
    setDescription(event?.description ?? '');
    setType(event?.type ?? 'event');
    setProjectId(event?.project_id ?? '');
    setColor(event?.color ?? PROJECT_PALETTE[0]);
    setReminderMin(
      event
        ? event.reminder_min
          ? String(event.reminder_min)
          : ''
        : defaultReminderMin > 0
          ? String(defaultReminderMin)
          : ''
    );
    setAllDay(!event?.start_time);
  }, [open, event, date, defaultReminderMin]);

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onSave({
        title,
        date: eventDate,
        start_time: allDay ? null : startTime || null,
        end_time: allDay ? null : endTime || null,
        description: description || null,
        type,
        project_id: projectId || null,
        color,
        reminder_min: reminderMin ? Number(reminderMin) : null
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={event ? 'Событие' : 'Новое событие'}
      footer={
        <>
          {event && onDelete && (
            <button
              onClick={async () => {
                if (confirm('Удалить событие?')) {
                  await onDelete();
                  onClose();
                }
              }}
              className="px-3 py-1.5 rounded-md text-sm text-danger border border-border mr-auto"
            >
              Удалить
            </button>
          )}
          <button onClick={onClose} className="px-3 py-1.5 rounded-md text-sm border border-border">
            Отмена
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-1.5 rounded-md text-sm bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
          >
            Сохранить
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="text-xs uppercase text-muted">Название</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            className="w-full mt-1 h-10 px-3 rounded-md border border-border bg-surface text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs uppercase text-muted">Дата</label>
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="w-full mt-1 h-10 px-3 rounded-md border border-border bg-surface text-sm"
            />
          </div>
          <div>
            <label className="text-xs uppercase text-muted">Тип</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as CalendarEventType)}
              className="w-full mt-1 h-10 px-2 rounded-md border border-border bg-surface text-sm"
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          Весь день
        </label>
        {!allDay && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs uppercase text-muted">Начало</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full mt-1 h-10 px-3 rounded-md border border-border bg-surface text-sm"
              />
            </div>
            <div>
              <label className="text-xs uppercase text-muted">Конец</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full mt-1 h-10 px-3 rounded-md border border-border bg-surface text-sm"
              />
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs uppercase text-muted">Проект</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full mt-1 h-10 px-2 rounded-md border border-border bg-surface text-sm"
            >
              <option value="">Без проекта</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.icon ?? ''} {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs uppercase text-muted">Напомнить за (мин)</label>
            <input
              type="number"
              value={reminderMin}
              onChange={(e) => setReminderMin(e.target.value)}
              placeholder="0"
              className="w-full mt-1 h-10 px-3 rounded-md border border-border bg-surface text-sm"
            />
          </div>
        </div>
        <div>
          <label className="text-xs uppercase text-muted">Цвет</label>
          <div className="flex flex-wrap gap-2 mt-2">
            {PROJECT_PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-7 h-7 rounded-md ${color === c ? 'ring-2 ring-ink ring-offset-2' : ''}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs uppercase text-muted">Описание</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full mt-1 p-3 rounded-md border border-border bg-surface text-sm resize-none"
          />
        </div>
      </div>
    </Modal>
  );
}

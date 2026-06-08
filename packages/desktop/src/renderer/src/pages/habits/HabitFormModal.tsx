import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { api } from '../../api';
import type { Habit, HabitCadence, HabitCadenceConfig } from '@swit/shared';
import Modal from '../../components/Modal';
import { PROJECT_PALETTE } from '../../lib/palette';
import { HABIT_ICONS, SELECTABLE_CADENCES, WEEKDAY_PICKERS } from './constants';
import { normalizeCadence } from './helpers';
import type { SelectableCadence } from './types';

// --- Form modal (mostly same as before, minus "цель за день") ---

export function HabitFormModal({
  open,
  habit,
  onClose,
  onSaved,
  onDelete
}: {
  open: boolean;
  habit: Habit | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}): JSX.Element {
  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState(HABIT_ICONS[0]);
  const [color, setColor] = useState<string>(PROJECT_PALETTE[0]);
  const [cadence, setCadence] = useState<SelectableCadence>('daily');
  const [weekdays, setWeekdays] = useState<number[]>([1, 3, 5]);
  const [timesPerWeek, setTimesPerWeek] = useState(3);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [remindEnabled, setRemindEnabled] = useState(false);
  const [remindTime, setRemindTime] = useState('09:00');
  const [confirmWindowH, setConfirmWindowH] = useState<number>(6);

  useEffect(() => {
    if (!open) return;
    setTitle(habit?.title ?? '');
    setIcon(habit?.icon ?? HABIT_ICONS[0]);
    setColor(habit?.color ?? PROJECT_PALETTE[0]);
    const { cadence: c, config } = normalizeCadence(habit);
    setCadence(c);
    setWeekdays(config.weekdays ?? [1, 3, 5]);
    setTimesPerWeek(config.times_per_week ?? 3);
    setDayOfMonth(config.day_of_month ?? 1);
    setRemindEnabled(!!habit?.remind_time);
    setRemindTime(habit?.remind_time ?? '09:00');
    setConfirmWindowH(habit?.confirm_window_h ?? 6);
  }, [open, habit]);

  function buildConfig(): HabitCadenceConfig {
    switch (cadence) {
      case 'specific_days':
        return { weekdays: weekdays.slice().sort((a, b) => a - b) };
      case 'weekly_n':
        return { times_per_week: Math.min(7, Math.max(1, timesPerWeek)) };
      case 'monthly_day':
        return { day_of_month: Math.min(31, Math.max(1, dayOfMonth)) };
      default:
        return {};
    }
  }

  async function save(): Promise<void> {
    if (!title.trim()) return;
    if (cadence === 'specific_days' && weekdays.length === 0) {
      alert('Выбери хотя бы один день недели');
      return;
    }
    const payload = {
      title,
      icon,
      color,
      cadence: cadence as HabitCadence,
      cadence_config: JSON.stringify(buildConfig()),
      target_count: 1, // фиксировано: рутина = сделано/не сделано, без объёмов
      remind_time: remindEnabled ? remindTime : null,
      confirm_window_h: Math.max(1, Math.min(48, Math.round(confirmWindowH)))
    };
    const saved = habit
      ? await api.updateHabit(habit.id, payload)
      : await api.createHabit(payload);
    await onSaved();
  }

  async function toggleArchive(): Promise<void> {
    if (!habit) return;
    await api.updateHabit(habit.id, { archived: habit.archived ? 0 : 1 });
    await onSaved();
  }

  function toggleWeekday(wd: number): void {
    setWeekdays((prev) =>
      prev.includes(wd) ? prev.filter((d) => d !== wd) : [...prev, wd]
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={habit ? 'Рутина' : 'Новая рутина'}
      footer={
        <>
          {habit && (
            <button
              onClick={() => {
                if (confirm(`Удалить «${habit.title}»? История выполнений будет утеряна.`))
                  void onDelete(habit.id);
              }}
              className="px-3 py-1.5 rounded-md text-sm text-red-500 border border-border mr-auto"
            >
              Удалить
            </button>
          )}
          {habit && (
            <button
              onClick={toggleArchive}
              className="px-3 py-1.5 rounded-md text-sm border border-border"
            >
              {habit.archived ? 'Вернуть' : 'В архив'}
            </button>
          )}
          <button onClick={onClose} className="px-3 py-1.5 rounded-md text-sm border border-border">
            Отмена
          </button>
          <button
            onClick={save}
            disabled={!title.trim()}
            className="px-4 py-1.5 rounded-md text-sm bg-accent text-white hover:bg-accent-hover disabled:opacity-40"
          >
            Сохранить
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-2 items-start">
          <select
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            className="h-10 px-2 rounded-md border border-border bg-surface text-lg"
          >
            {HABIT_ICONS.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            placeholder="Например, «Оплатить квартиру»"
            className="flex-1 h-10 px-3 rounded-md border border-border bg-surface text-sm"
          />
        </div>

        <div>
          <label className="text-xs uppercase text-muted">Когда напоминать</label>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {SELECTABLE_CADENCES.map((c) => (
              <button
                key={c.value}
                onClick={() => setCadence(c.value)}
                className={`px-3 py-2 rounded-md text-sm border text-left transition ${
                  cadence === c.value
                    ? 'border-accent bg-accent-light text-ink'
                    : 'border-border text-muted hover:bg-surface2'
                }`}
              >
                <div className="font-medium">{c.label}</div>
                <div className="text-[10px] opacity-70">{c.hint}</div>
              </button>
            ))}
          </div>

          {cadence === 'specific_days' && (
            <div className="mt-3">
              <div className="text-[11px] text-muted mb-1.5">В какие дни недели?</div>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAY_PICKERS.map((d) => (
                  <button
                    key={d.wd}
                    onClick={() => toggleWeekday(d.wd)}
                    className={`w-10 h-9 rounded-md text-xs font-medium border transition ${
                      weekdays.includes(d.wd)
                        ? 'bg-accent text-white border-accent'
                        : 'bg-surface text-muted border-border hover:bg-surface2'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 mt-2 text-[10px]">
                <button
                  onClick={() => setWeekdays([1, 2, 3, 4, 5])}
                  className="text-accent hover:underline"
                >
                  Будни
                </button>
                <button
                  onClick={() => setWeekdays([0, 6])}
                  className="text-accent hover:underline"
                >
                  Выходные
                </button>
                <button
                  onClick={() => setWeekdays([0, 1, 2, 3, 4, 5, 6])}
                  className="text-accent hover:underline"
                >
                  Всё подряд
                </button>
              </div>
            </div>
          )}

          {cadence === 'weekly_n' && (
            <div className="mt-3">
              <div className="text-[11px] text-muted mb-1.5">
                Сколько раз в неделю · {timesPerWeek}
              </div>
              <input
                type="range"
                min={1}
                max={7}
                value={timesPerWeek}
                onChange={(e) => setTimesPerWeek(Number(e.target.value))}
                className="w-full"
              />
              <div className="text-[10px] text-faint mt-1">
                Будет напоминать каждый день недели, пока не закроешь нужное количество.
              </div>
            </div>
          )}

          {cadence === 'monthly_day' && (
            <div className="mt-3">
              <label className="text-[11px] text-muted block mb-1.5">Какого числа?</label>
              <input
                type="number"
                min={1}
                max={31}
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(Number(e.target.value))}
                className="w-20 h-9 px-2 rounded-md border border-border bg-surface text-sm"
              />
              <div className="text-[10px] text-faint mt-1">
                В коротких месяцах сдвинется на последний день.
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="text-xs uppercase text-muted flex items-center justify-between">
            <span>Пуш-уведомление</span>
            <input
              type="checkbox"
              checked={remindEnabled}
              onChange={(e) => setRemindEnabled(e.target.checked)}
              className="accent-accent"
            />
          </label>
          {remindEnabled && (
            <div className="mt-2 flex items-center gap-2">
              <Bell size={14} className="text-accent" />
              <input
                type="time"
                value={remindTime}
                onChange={(e) => setRemindTime(e.target.value)}
                className="h-9 px-2 rounded-md border border-border bg-surface text-sm"
              />
              <span className="text-[11px] text-faint">
                В подходящий день — уведомление в этот час
              </span>
            </div>
          )}
        </div>

        {cadence !== 'weekly_n' && (
          <div>
            <label className="text-xs uppercase text-muted">
              Окно подтверждения · {confirmWindowH} ч
            </label>
            <input
              type="range"
              min={1}
              max={24}
              value={confirmWindowH}
              onChange={(e) => setConfirmWindowH(Number(e.target.value))}
              className="w-full mt-2"
            />
            <div className="text-[10px] text-faint mt-1">
              Сколько часов после {remindEnabled ? `${remindTime}` : 'конца дня'} даём на отметку
              «Выполнил». По истечении — день автоматически становится пропуском, стрик рвётся.
            </div>
          </div>
        )}

        <div>
          <label className="text-xs uppercase text-muted">Цвет</label>
          <div className="flex flex-wrap gap-2 mt-2">
            {PROJECT_PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-md ring-offset-2 ring-offset-surface ${
                  color === c ? 'ring-2 ring-ink' : ''
                }`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

import type { Habit, HabitCadence, HabitCadenceConfig, HabitLog } from '@swit/shared';
import { format, getDay, startOfWeek, endOfWeek, isWithinInterval, parseISO } from 'date-fns';

/**
 * Парсит cadence_config (JSON-строка) безопасно.
 * Возвращает {} если поле пустое или невалидный JSON.
 */
export function parseCadenceConfig(habit: Habit): HabitCadenceConfig {
  if (!habit.cadence_config) return {};
  try {
    return JSON.parse(habit.cadence_config) as HabitCadenceConfig;
  } catch {
    return {};
  }
}

// date-fns getDay: 0=Вс, 1=Пн, ..., 6=Сб — наш формат совпадает.

/**
 * Должна ли привычка появляться в чек-листе на эту дату?
 *
 * Логика:
 * - daily            — всегда true
 * - specific_days    — true если weekday входит в config.weekdays
 * - weekly_n         — true каждый день недели, в которой ещё не достигнуто N выполнений
 *                       (мы показываем «есть слот» пока надо ещё закрыть в эту неделю)
 * - monthly_day      — true только если день месяца совпадает с config.day_of_month;
 *                       если месяц короче (28/29/30 vs 31), сдвигаем на последний день месяца
 * - weekdays (legacy)— Пн–Пт
 * - weekly (legacy)  — только понедельник
 */
export function isHabitDueOn(
  habit: Habit,
  date: Date,
  logsForHabit?: Map<string, number>
): boolean {
  const cfg = parseCadenceConfig(habit);
  const wd = getDay(date); // 0..6

  switch (habit.cadence as HabitCadence) {
    case 'daily':
      return true;

    case 'specific_days': {
      const days = cfg.weekdays ?? [];
      return days.includes(wd);
    }

    case 'weekly_n': {
      const n = Math.max(1, cfg.times_per_week ?? 1);
      if (!logsForHabit) return true; // без данных — считаем что слот есть
      const ws = startOfWeek(date, { weekStartsOn: 1 });
      const we = endOfWeek(date, { weekStartsOn: 1 });
      let doneThisWeek = 0;
      for (const [d, count] of logsForHabit) {
        if (count <= 0) continue;
        const dt = parseISO(d);
        if (isWithinInterval(dt, { start: ws, end: we })) doneThisWeek++;
      }
      return doneThisWeek < n;
    }

    case 'monthly_day': {
      const targetDay = cfg.day_of_month ?? 1;
      const day = date.getDate();
      // Last day of current month
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      const effective = Math.min(targetDay, lastDay);
      return day === effective;
    }

    // Legacy values:
    case 'weekdays':
      return wd >= 1 && wd <= 5;
    case 'weekly':
      return wd === 1;

    default:
      return true;
  }
}

/**
 * Человекочитаемая подпись частоты для UI.
 */
export function cadenceLabel(habit: Habit): string {
  const cfg = parseCadenceConfig(habit);
  switch (habit.cadence) {
    case 'daily':
      return 'Каждый день';
    case 'specific_days': {
      const days = cfg.weekdays ?? [];
      if (days.length === 0) return 'Дни не выбраны';
      if (days.length === 7) return 'Каждый день';
      // 1..5 → будни, 0+6 → выходные
      const weekdaysOnly = days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d));
      if (weekdaysOnly) return 'По будням';
      const weekendsOnly = days.length === 2 && days.includes(0) && days.includes(6);
      if (weekendsOnly) return 'По выходным';
      const names = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
      return days
        .slice()
        .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)) // Пн-перво
        .map((d) => names[d])
        .join(', ');
    }
    case 'weekly_n': {
      const n = cfg.times_per_week ?? 1;
      return `${n} раз${n === 1 ? '' : n < 5 ? 'а' : ''} в неделю`;
    }
    case 'monthly_day': {
      const d = cfg.day_of_month ?? 1;
      return `Каждое ${d} число`;
    }
    case 'weekdays':
      return 'По будням';
    case 'weekly':
      return 'Раз в неделю';
    default:
      return habit.cadence;
  }
}

/**
 * Группирует логи по habit_id → Map<date, count>.
 */
export function buildLogMap(logs: HabitLog[]): Map<string, Map<string, number>> {
  const m = new Map<string, Map<string, number>>();
  for (const l of logs) {
    let inner = m.get(l.habit_id);
    if (!inner) {
      inner = new Map();
      m.set(l.habit_id, inner);
    }
    inner.set(l.date, l.count);
  }
  return m;
}

/**
 * Привычки, которые сегодня (date) нужны и ещё не закрыты.
 */
export function dueHabitsToday(
  habits: Habit[],
  logs: HabitLog[],
  date: Date = new Date()
): { habit: Habit; done: boolean }[] {
  const map = buildLogMap(logs);
  const dateKey = format(date, 'yyyy-MM-dd');
  return habits
    .filter((h) => !h.archived)
    .filter((h) => isHabitDueOn(h, date, map.get(h.id)))
    .map((h) => {
      const count = map.get(h.id)?.get(dateKey) ?? 0;
      return { habit: h, done: count >= h.target_count };
    });
}

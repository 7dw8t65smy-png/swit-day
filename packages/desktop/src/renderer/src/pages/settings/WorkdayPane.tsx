import type { Project } from '@swit/shared';
import type { AppSettings } from '../../lib/settings';
import type { PatchFn } from './types';
import { Section, Row, NumberInput } from './ui';

export function WorkdayPane({
  s,
  patch,
  projects
}: {
  s: AppSettings;
  patch: PatchFn;
  projects: Project[];
}): JSX.Element {
  return (
    <div className="space-y-5">
      <Section
        title="Часы работы"
        hint="Используется в напоминаниях о начале/конце дня и в статистике."
      >
        <Row label="Время начала">
          <input
            type="time"
            value={s.day_start}
            onChange={(e) => patch('day_start', e.target.value)}
            className="input w-40"
          />
        </Row>
        <Row label="Время окончания">
          <input
            type="time"
            value={s.day_end}
            onChange={(e) => patch('day_end', e.target.value)}
            className="input w-40"
          />
        </Row>
      </Section>

      <Section title="Pomodoro" hint="Длительности фокус-сессий и перерывов в минутах.">
        <Row label="Сессия фокуса">
          <NumberInput
            value={s.pomodoro_work_min}
            onChange={(v) => patch('pomodoro_work_min', v)}
            min={5}
            max={120}
            suffix="мин"
          />
        </Row>
        <Row label="Короткий перерыв">
          <NumberInput
            value={s.pomodoro_break_min}
            onChange={(v) => patch('pomodoro_break_min', v)}
            min={1}
            max={30}
            suffix="мин"
          />
        </Row>
        <Row label="Длинный перерыв">
          <NumberInput
            value={s.pomodoro_long_break_min}
            onChange={(v) => patch('pomodoro_long_break_min', v)}
            min={5}
            max={60}
            suffix="мин"
          />
        </Row>
        <Row label="Длинный перерыв через">
          <NumberInput
            value={s.pomodoro_sessions_before_long}
            onChange={(v) => patch('pomodoro_sessions_before_long', v)}
            min={2}
            max={10}
            suffix="сессий"
          />
        </Row>
      </Section>

      <Section title="Новые задачи" hint="Что подставлять по умолчанию при создании задачи.">
        <Row label="Проект">
          <select
            value={s.default_project_id}
            onChange={(e) => patch('default_project_id', e.target.value)}
            className="input"
          >
            <option value="">Без проекта</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.icon ?? ''} {p.name}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Приоритет">
          <select
            value={s.default_priority}
            onChange={(e) =>
              patch('default_priority', e.target.value as AppSettings['default_priority'])
            }
            className="input w-40"
          >
            <option value="low">↓ Низкий</option>
            <option value="normal">— Обычный</option>
            <option value="high">↑ Высокий</option>
            <option value="urgent">🔥 Срочный</option>
          </select>
        </Row>
        <Row label="Сложность">
          <select
            value={s.default_difficulty}
            onChange={(e) =>
              patch('default_difficulty', e.target.value as AppSettings['default_difficulty'])
            }
            className="input w-40"
          >
            <option value="easy">🟢 Лёгкая</option>
            <option value="medium">🟡 Средняя</option>
            <option value="hard">🔴 Сложная</option>
          </select>
        </Row>
      </Section>

      <Section title="Новые события">
        <Row label="Напоминание за">
          <NumberInput
            value={s.default_event_reminder_min}
            onChange={(v) => patch('default_event_reminder_min', v)}
            min={0}
            max={1440}
            suffix="мин до начала"
          />
        </Row>
      </Section>
    </div>
  );
}

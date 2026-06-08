import { Sun, Moon, Monitor } from 'lucide-react';
import { PROJECT_PALETTE } from '../../lib/palette';
import type { AppSettings } from '../../lib/settings';
import type { PatchFn } from './types';
import { Section, Row, ToggleRow } from './ui';

export function AppearancePane({ s, patch }: { s: AppSettings; patch: PatchFn }): JSX.Element {
  return (
    <div className="space-y-5">
      <Section title="Тема" hint="Применяется мгновенно.">
        <div className="grid grid-cols-3 gap-2">
          {([
            { v: 'light', label: 'Светлая', Icon: Sun },
            { v: 'dark', label: 'Тёмная', Icon: Moon },
            { v: 'system', label: 'Системная', Icon: Monitor }
          ] as const).map((t) => (
            <button
              key={t.v}
              onClick={() => patch('theme', t.v)}
              className={`flex flex-col items-center gap-2 py-4 rounded-md border transition ${
                s.theme === t.v
                  ? 'border-accent bg-accent-light text-accent'
                  : 'border-border hover:bg-surface2'
              }`}
            >
              <t.Icon size={18} />
              <span className="text-sm">{t.label}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Акцентный цвет" hint="Меняет цвет акцента в кнопках, активных пунктах, выделениях. Применяется мгновенно.">
        <div className="flex flex-wrap gap-2">
          {PROJECT_PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => patch('accent_color', c)}
              className={`w-9 h-9 rounded-md transition ${
                s.accent_color === c ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface' : ''
              }`}
              style={{ background: c }}
              title={c}
            />
          ))}
        </div>
      </Section>

      <Section title="Плотность" hint="Меняет размер шрифта и отступов всего интерфейса. Применяется мгновенно.">
        <div className="grid grid-cols-3 gap-2">
          {(['compact', 'normal', 'spacious'] as const).map((d) => (
            <button
              key={d}
              onClick={() => patch('ui_density', d)}
              className={`px-3 py-2 rounded-md border text-sm transition ${
                s.ui_density === d
                  ? 'border-accent bg-accent-light text-accent'
                  : 'border-border hover:bg-surface2'
              }`}
            >
              {d === 'compact' ? 'Компактно' : d === 'normal' ? 'Обычно' : 'Просторно'}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Поведение списков">
        <ToggleRow
          label="Показывать выполненные задачи"
          hint="Включает их в фильтр «Открытые» по умолчанию."
          value={s.show_completed_tasks}
          onChange={(v) => patch('show_completed_tasks', v)}
        />
        <Row label="Неделя начинается с">
          <div className="flex gap-2">
            {(['mon', 'sun'] as const).map((w) => (
              <button
                key={w}
                onClick={() => patch('week_starts_on', w)}
                className={`px-3 py-1.5 rounded-md text-sm border transition ${
                  s.week_starts_on === w
                    ? 'bg-accent text-white border-accent'
                    : 'border-border hover:bg-surface2'
                }`}
              >
                {w === 'mon' ? 'Понедельника' : 'Воскресенья'}
              </button>
            ))}
          </div>
        </Row>
        <Row label="Валюта" hint="Используется в разделе «Расходы».">
          <div className="flex gap-2">
            {(['RUB', 'USD'] as const).map((c) => (
              <button
                key={c}
                onClick={() => patch('currency', c)}
                className={`px-3 py-1.5 rounded-md text-sm border transition ${
                  s.currency === c
                    ? 'bg-accent text-white border-accent'
                    : 'border-border hover:bg-surface2'
                }`}
              >
                {c === 'RUB' ? '₽ Рубль' : '$ Доллар'}
              </button>
            ))}
          </div>
        </Row>
      </Section>
    </div>
  );
}

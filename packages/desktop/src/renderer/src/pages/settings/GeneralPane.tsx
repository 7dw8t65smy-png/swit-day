import type { AppSettings } from '../../lib/settings';
import { PAGES } from './constants';
import type { PatchFn } from './types';
import { Section, Row, ToggleRow } from './ui';

export function GeneralPane({ s, patch }: { s: AppSettings; patch: PatchFn }): JSX.Element {
  return (
    <div className="space-y-5">
      <Section title="Профиль" hint="Имя используется в приветствиях и сводках дня.">
        <Row label="Имя">
          <input
            value={s.user_name}
            onChange={(e) => patch('user_name', e.target.value)}
            placeholder="Никита"
            className="input"
          />
        </Row>
      </Section>

      <Section title="Запуск">
        <Row label="Стартовая страница" hint="Куда открывать приложение при запуске.">
          <select
            value={s.start_page}
            onChange={(e) => patch('start_page', e.target.value)}
            className="input"
          >
            {PAGES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </Row>
        <ToggleRow
          label="Запускать при старте Mac"
          hint="Требует интеграции в main-процесс (app.setLoginItemSettings). Пока сохраняется как намерение."
          value={s.autostart}
          onChange={(v) => patch('autostart', v)}
        />
      </Section>

      <Section title="Окно и трей">
        <ToggleRow
          label="Сворачивать в трей вместо закрытия"
          hint="Требует интеграции в main-процесс. Пока сохраняется как намерение."
          value={s.minimize_to_tray}
          onChange={(v) => patch('minimize_to_tray', v)}
        />
        <ToggleRow
          label="Показывать иконку в menubar"
          value={s.show_tray_icon}
          onChange={(v) => patch('show_tray_icon', v)}
        />
      </Section>

      <Section title="Поведение">
        <ToggleRow
          label="Подтверждать удаление"
          hint="Запрашивать «точно удалить?» перед стиранием задач/заметок/проектов."
          value={s.confirm_delete}
          onChange={(v) => patch('confirm_delete', v)}
        />
      </Section>
    </div>
  );
}

import type { AppSettings } from '../../lib/settings';
import type { PatchFn } from './types';
import { Section, Row } from './ui';

export function IntegrationsPane({ s, patch }: { s: AppSettings; patch: PatchFn }): JSX.Element {
  return (
    <div className="space-y-5">
      <Section
        title="Backend (для VDS)"
        hint="Оставь пустым для локального backend (127.0.0.1:47821). Заполни URL и токен, когда вынесешь сервер на VDS."
      >
        <Row label="URL backend">
          <input
            value={s.backend_url}
            onChange={(e) => patch('backend_url', e.target.value)}
            placeholder="https://swit.example.com"
            className="input"
          />
        </Row>
        <Row label="Bearer token">
          <input
            value={s.backend_token}
            onChange={(e) => patch('backend_token', e.target.value)}
            type="password"
            placeholder="…"
            className="input"
          />
        </Row>
      </Section>

    </div>
  );
}

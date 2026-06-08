import { ExternalLink } from 'lucide-react';
import { Section } from './ui';

export function AboutPane(): JSX.Element {
  return (
    <div className="space-y-5">
      <Section title="О приложении">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl bg-accent text-white flex items-center justify-center text-2xl font-bold shadow-sm">
            S
          </div>
          <div>
            <div className="text-lg font-semibold">SWIT Day</div>
            <div className="text-sm text-muted">Персональный планировщик рабочего дня</div>
            <div className="text-xs text-faint mt-1">Версия 0.1.0</div>
          </div>
        </div>
      </Section>

      <Section title="Ссылки">
        <div className="flex flex-col gap-2">
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="text-sm text-accent hover:underline flex items-center gap-1.5"
          >
            <ExternalLink size={13} /> Репозиторий проекта
          </a>
          <button
            onClick={() => alert('Проверка обновлений будет в финальной сборке.')}
            className="text-sm text-accent hover:underline flex items-center gap-1.5 self-start"
          >
            <ExternalLink size={13} /> Проверить обновления
          </button>
        </div>
      </Section>

      <Section title="Технологии">
        <div className="text-xs text-muted">
          Electron · React · TypeScript · Tailwind · SQLite · Fastify
        </div>
      </Section>
    </div>
  );
}

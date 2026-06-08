import { useEffect, useRef, useState } from 'react';
import { Save, Download, Upload, RotateCcw, Trash2, Folder } from 'lucide-react';
import { api, notify, type BackupInfo } from '../../api';
import { localDateKey } from '../../lib/date';
import { Section } from './ui';

export function DataPane({ onResetDefaults }: { onResetDefaults: () => Promise<void> }): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [backups, setBackups] = useState<BackupInfo[]>([]);

  useEffect(() => {
    void api.listBackups().then(setBackups).catch(() => setBackups([]));
  }, []);

  async function backupNow(): Promise<void> {
    setBusy(true);
    setStatus(null);
    try {
      await api.createBackup();
      setBackups(await api.listBackups());
      setStatus('Резервная копия создана');
    } catch (err) {
      setStatus(`Не удалось создать копию: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function exportAll(): Promise<void> {
    setBusy(true);
    setStatus(null);
    try {
      const data = await api.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `swit-day-export-${localDateKey()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus('Экспорт готов');
    } finally {
      setBusy(false);
    }
  }

  async function importFile(file: File): Promise<void> {
    setBusy(true);
    setStatus(null);
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const result = await api.importData(parsed);
      const imported = Object.values(result.counts).reduce((sum, count) => sum + count, 0);
      const message =
        `Профиль загружен (${imported} записей). Нажмите Command + R, чтобы перезагрузить приложение и увидеть добавленные профили.`;
      setStatus(message);
      notify('SWIT Day', message);
      window.alert(message);
    } catch (err) {
      const message = `Не удалось импортировать файл: ${err instanceof Error ? err.message : String(err)}`;
      setStatus(message);
      window.alert(message);
    } finally {
      if (importInputRef.current) importInputRef.current.value = '';
      setBusy(false);
    }
  }

  async function deleteAllData(): Promise<void> {
    if (!confirm('Удалить все данные SWIT Day? Это действие нельзя отменить.')) return;
    if (!confirm('Точно удалить задачи, проекты, заметки, события, журнал, рутины, финансы и настройки?')) return;
    setBusy(true);
    setStatus(null);
    try {
      const result = await api.resetData();
      const deleted = Object.values(result.counts).reduce((sum, count) => sum + count, 0);
      const message = `Данные удалены (${deleted} записей). Нажмите Command + R, чтобы перезагрузить приложение.`;
      setStatus(message);
      notify('SWIT Day', message);
      window.alert(message);
    } catch (err) {
      const message = `Не удалось удалить данные: ${err instanceof Error ? err.message : String(err)}`;
      setStatus(message);
      window.alert(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Section title="Экспорт и импорт" hint="Сохрани снимок всех данных или восстанови из бэкапа.">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={exportAll}
            disabled={busy}
            className="px-4 h-10 rounded-md border border-border bg-surface text-sm hover:bg-surface2 flex items-center gap-2"
          >
            <Download size={14} /> Экспортировать всё (JSON)
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              if (file) void importFile(file);
            }}
          />
          <button
            onClick={() => importInputRef.current?.click()}
            disabled={busy}
            className="px-4 h-10 rounded-md border border-border bg-surface text-sm hover:bg-surface2 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Upload size={14} /> Импортировать из файла
          </button>
        </div>
        {status && <div className="text-xs text-muted mt-2">{status}</div>}
      </Section>

      <Section
        title="Резервные копии"
        hint="Копия базы снимается автоматически раз в день при запуске. Хранятся последние 14."
      >
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => void backupNow()}
            disabled={busy}
            className="px-4 h-10 rounded-md border border-border bg-surface text-sm hover:bg-surface2 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Save size={14} /> Создать копию сейчас
          </button>
          <span className="text-xs text-muted">
            {backups.length > 0
              ? `Последняя: ${backups[0].date} · всего копий: ${backups.length}`
              : 'Копий пока нет'}
          </span>
        </div>
      </Section>

      <Section title="Хранилище">
        <button
          onClick={async () => {
            const error = await window.swit?.openDataFolder();
            if (error) window.alert(`Не удалось открыть папку: ${error}`);
          }}
          className="px-4 h-10 rounded-md border border-border bg-surface text-sm hover:bg-surface2 flex items-center gap-2"
        >
          <Folder size={14} /> Открыть папку с базой
        </button>
      </Section>

      <Section title="Опасная зона" hint="Действия из этого раздела необратимы.">
        <div className="flex flex-col gap-2">
          <button
            onClick={onResetDefaults}
            className="px-4 h-10 rounded-md border border-amber-300 bg-amber-50 text-amber-800 text-sm hover:bg-amber-100 flex items-center gap-2 self-start"
          >
            <RotateCcw size={14} /> Сбросить настройки к дефолту
          </button>
          <button
            onClick={() => void deleteAllData()}
            disabled={busy}
            className="px-4 h-10 rounded-md border border-red-300 bg-red-50 text-red-700 text-sm hover:bg-red-100 flex items-center gap-2 self-start"
          >
            <Trash2 size={14} /> Удалить все данные
          </button>
        </div>
      </Section>
    </div>
  );
}

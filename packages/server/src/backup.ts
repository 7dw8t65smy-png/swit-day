import fs from 'node:fs';
import path from 'node:path';
import { db } from './db.js';
import { DATA_DIR, DB_PATH } from './config.js';

// Локальные бэкапы SQLite. Личный планировщик хранит единственный .db —
// потеря файла = потеря всего. Раз в день при старте снимаем онлайн-копию
// (better-sqlite3 .backup() безопасен при работающей БД) и держим последние
// KEEP штук.

export const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const KEEP = 14;
const FILE_RE = /^swit-day-(\d{4}-\d{2}-\d{2})\.db$/;

export interface BackupInfo {
  file: string;
  date: string;
  size: number;
  created_at: string;
}

function todayStamp(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function backupFiles(): string[] {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  // ISO-даты сортируются лексикографически = хронологически (старые → новые).
  return fs.readdirSync(BACKUP_DIR).filter((f) => FILE_RE.test(f)).sort();
}

/** Список бэкапов, новые сверху. */
export function listBackups(): BackupInfo[] {
  return backupFiles()
    .map((file) => {
      const stat = fs.statSync(path.join(BACKUP_DIR, file));
      const match = file.match(FILE_RE);
      return {
        file,
        date: match?.[1] ?? '',
        size: stat.size,
        created_at: stat.mtime.toISOString()
      };
    })
    .reverse();
}

function prune(): void {
  const files = backupFiles(); // старые первыми
  const excess = files.length - KEEP;
  for (let i = 0; i < excess; i++) {
    try {
      fs.unlinkSync(path.join(BACKUP_DIR, files[i]));
    } catch {
      /* битый файл — пропускаем */
    }
  }
}

/** Снять бэкап сейчас (перезаписывает сегодняшний). Возвращает путь к файлу. */
export async function createBackup(): Promise<string> {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const dest = path.join(BACKUP_DIR, `swit-day-${todayStamp()}.db`);
  await db.backup(dest);
  prune();
  return dest;
}

/** Стартовый бэкап: снимаем раз в сутки, если сегодняшнего ещё нет. */
export async function backupOnStartup(): Promise<void> {
  try {
    if (!fs.existsSync(DB_PATH)) return;
    const dest = path.join(BACKUP_DIR, `swit-day-${todayStamp()}.db`);
    if (fs.existsSync(dest)) {
      prune();
      return;
    }
    await createBackup();
  } catch (err) {
    console.error('[backup] startup backup failed:', err);
  }
}

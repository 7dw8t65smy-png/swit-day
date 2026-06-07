import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const dataDirEnv = process.env.SWIT_DATA_DIR;
const defaultDataDir =
  process.platform === 'darwin'
    ? path.join(os.homedir(), 'Library', 'Application Support', 'SWIT Day')
    : path.join(os.homedir(), '.swit-day');

export const DATA_DIR = dataDirEnv ?? defaultDataDir;
fs.mkdirSync(DATA_DIR, { recursive: true });

export const DB_PATH = path.join(DATA_DIR, 'swit-day.db');
export const HOST = process.env.SWIT_HOST ?? '127.0.0.1';
export const PORT = Number(process.env.SWIT_PORT ?? 47821);

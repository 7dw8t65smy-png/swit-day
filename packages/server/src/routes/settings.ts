import type { FastifyInstance } from 'fastify';
import { db } from '../db.js';

export function registerSettings(app: FastifyInstance): void {
  app.get('/settings', () => {
    const rows = db.prepare('SELECT key, value FROM settings').all() as {
      key: string;
      value: string;
    }[];
    const out: Record<string, string> = {};
    for (const r of rows) out[r.key] = r.value;
    return out;
  });

  app.put<{ Body: Record<string, string> }>('/settings', (req) => {
    const stmt = db.prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    );
    const tx = db.transaction((entries: [string, string][]) => {
      for (const [k, v] of entries) stmt.run(k, v);
    });
    tx(Object.entries(req.body));
    return { ok: true };
  });
}

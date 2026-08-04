import { Router } from 'express';
import { db } from '../db/connection.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

export const settingsRouter = Router();

settingsRouter.get('/', requireAuth, (_req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const obj: Record<string, string> = {};
  for (const r of rows) obj[r.key] = r.value;
  res.json(obj);
});

settingsRouter.put('/', requireAuth, requireAdmin, (req, res) => {
  const data = req.body as Record<string, string>;
  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  db.transaction(() => {
    for (const [key, value] of Object.entries(data)) upsert.run(key, value);
  })();
  res.json({ ok: true });
});

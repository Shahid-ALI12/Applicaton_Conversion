import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { listBackups, runBackup } from '../services/backup.js';

export const backupsRouter = Router();

backupsRouter.get('/', requireAuth, requireAdmin, (_req, res) => {
  res.json(listBackups());
});

backupsRouter.post('/run', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const file = await runBackup();
    res.json({ ok: true, file });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'BACKUP_FAILED', message: 'Failed to create backup', detail: err?.message } });
  }
});

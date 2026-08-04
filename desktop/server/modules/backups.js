import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { listBackups, runBackup } from '../services/backup.js';
export const backupsRouter = Router();
backupsRouter.get('/', requireAuth, requireAdmin, (_req, res) => {
    res.json(listBackups());
});
backupsRouter.post('/run', requireAuth, requireAdmin, (_req, res) => {
    const file = runBackup();
    res.json({ ok: true, file });
});
//# sourceMappingURL=backups.js.map
import { Router } from 'express';
import { db } from '../db/connection.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
export const settingsRouter = Router();
settingsRouter.get('/', requireAuth, (_req, res) => {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const obj = {};
    for (const r of rows)
        obj[r.key] = r.value;
    res.json(obj);
});
settingsRouter.put('/', requireAuth, requireAdmin, (req, res) => {
    const data = req.body;
    const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    db.transaction(() => {
        for (const [key, value] of Object.entries(data))
            upsert.run(key, value);
    })();
    res.json({ ok: true });
});
//# sourceMappingURL=settings.js.map
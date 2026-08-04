import { Router } from 'express';
import { z } from 'zod';
import { db, round2 } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { cacheInvalidate } from '../utils/cache.js';
export const cashRouter = Router();
cashRouter.get('/accounts', requireAuth, (_req, res) => {
    const rows = db.prepare('SELECT * FROM cash_accounts ORDER BY id').all();
    res.json(rows);
});
cashRouter.get('/balances', requireAuth, (_req, res) => {
    const rows = db.prepare(`
    SELECT ca.id, ca.name,
      COALESCE(SUM(CASE WHEN cl.direction='in' THEN cl.amount ELSE -cl.amount END), 0) as balance
    FROM cash_accounts ca
    LEFT JOIN cash_ledger cl ON cl.account_id = ca.id
    GROUP BY ca.id
    ORDER BY ca.id
  `).all();
    res.json(rows);
});
cashRouter.get('/ledger', requireAuth, (req, res) => {
    const accountId = req.query.accountId ? Number(req.query.accountId) : undefined;
    const dateFrom = req.query.dateFrom;
    const dateTo = req.query.dateTo;
    let where = '1=1';
    const params = [];
    if (accountId) {
        where += ' AND cl.account_id = ?';
        params.push(accountId);
    }
    if (dateFrom) {
        where += ' AND cl.entry_date >= ?';
        params.push(dateFrom);
    }
    if (dateTo) {
        where += ' AND cl.entry_date <= ?';
        params.push(dateTo);
    }
    const rows = db.prepare(`SELECT cl.*, ca.name as account_name FROM cash_ledger cl JOIN cash_accounts ca ON ca.id=cl.account_id WHERE ${where} ORDER BY cl.id DESC LIMIT 500`).all(...params);
    res.json(rows);
});
cashRouter.post('/transfer', requireAuth, validateBody(z.object({
    from_account_id: z.number().int().positive(),
    to_account_id: z.number().int().positive(),
    amount: z.number().positive(),
    transfer_date: z.string(),
    notes: z.string().nullable().optional(),
    entered_by: z.string().nullable().optional(),
})), (req, res) => {
    const body = req.body;
    const result = db.transaction(() => {
        const r = db.prepare('INSERT INTO cash_transfers (transfer_date, from_account_id, to_account_id, amount, notes, entered_by) VALUES (?, ?, ?, ?, ?, ?)').run(body.transfer_date, body.from_account_id, body.to_account_id, round2(body.amount), body.notes ?? null, body.entered_by ?? null);
        const transferId = Number(r.lastInsertRowid);
        db.prepare('INSERT INTO cash_ledger (entry_date, account_id, direction, amount, source_type, source_id, description) VALUES (?, ?, ?, ?, ?, ?, ?)').run(body.transfer_date, body.from_account_id, 'out', round2(body.amount), 'transfer', transferId, `Transfer out #${transferId}`);
        db.prepare('INSERT INTO cash_ledger (entry_date, account_id, direction, amount, source_type, source_id, description) VALUES (?, ?, ?, ?, ?, ?, ?)').run(body.transfer_date, body.to_account_id, 'in', round2(body.amount), 'transfer', transferId, `Transfer in #${transferId}`);
        return { id: transferId };
    })();
    cacheInvalidate('cash_ledger');
    res.status(201).json(result);
});
cashRouter.post('/correction', requireAuth, validateBody(z.object({
    account_id: z.number().int().positive(),
    target: z.number(),
    correction_date: z.string(),
    entered_by: z.string().nullable().optional(),
})), (req, res) => {
    const body = req.body;
    const result = db.transaction(() => {
        const current = db.prepare(`SELECT COALESCE(SUM(CASE WHEN direction='in' THEN amount ELSE -amount END), 0) as bal FROM cash_ledger WHERE account_id = ?`).get(body.account_id).bal;
        const diff = round2(body.target - current);
        if (diff === 0)
            return { adjusted: false };
        const dir = diff > 0 ? 'in' : 'out';
        db.prepare('INSERT INTO cash_ledger (entry_date, account_id, direction, amount, source_type, description, entered_by) VALUES (?, ?, ?, ?, ?, ?, ?)').run(body.correction_date, body.account_id, dir, Math.abs(diff), 'correction', 'Manual balance correction', body.entered_by ?? null);
        return { adjusted: true, previous: current, new: body.target, diff };
    })();
    cacheInvalidate('cash_ledger');
    res.json(result);
});
//# sourceMappingURL=cash.js.map
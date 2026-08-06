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

// IMPORTANT: frontend's useCashBalances hook expects Record<string, number>
// i.e. { "Cash In Hand": 1000, "Cash In Locker": 500 } keyed by account name.
// Previously this returned an array [{id, name, balance}, ...] which the
// frontend silently dropped (because Array.isArray check failed) — making
// every balance card show "Rs. 0" even after corrections/transfers.
cashRouter.get('/balances', requireAuth, (_req, res) => {
  const rows = db.prepare(`
    SELECT ca.id, ca.name,
      COALESCE(SUM(CASE WHEN cl.direction='in' THEN cl.amount ELSE -cl.amount END), 0) as balance
    FROM cash_accounts ca
    LEFT JOIN cash_ledger cl ON cl.account_id = ca.id
    GROUP BY ca.id
    ORDER BY ca.id
  `).all() as Array<{ id: number; name: string; balance: number }>;
  const result: Record<string, number> = {};
  for (const r of rows) {
    result[r.name] = r.balance;
  }
  res.json(result);
});

cashRouter.get('/ledger', requireAuth, (req, res) => {
  const accountId = req.query.accountId ? Number(req.query.accountId) : undefined;
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;
  let where = '1=1';
  const params: (string | number)[] = [];
  if (accountId) { where += ' AND cl.account_id = ?'; params.push(accountId); }
  if (dateFrom) { where += ' AND cl.entry_date >= ?'; params.push(dateFrom); }
  if (dateTo) { where += ' AND cl.entry_date <= ?'; params.push(dateTo); }
  const rows = db.prepare(`SELECT cl.*, ca.name as account_name FROM cash_ledger cl JOIN cash_accounts ca ON ca.id=cl.account_id WHERE ${where} ORDER BY cl.id DESC LIMIT 500`).all(...params);
  res.json(rows);
});

// GET — paginated transfer history. Frontend's useCashTransfers hook expects:
//   { rows: CashTransfer[]; total: number; page: number; pageSize: number; totalPages: number }
// Filters: ?dateFrom=&dateTo=&page=&pageSize=
cashRouter.get('/transfer', requireAuth, (req, res) => {
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;
  const page = Math.max(1, Number(req.query.page ?? '1') || 1);
  const pageSize = Math.min(500, Math.max(1, Number(req.query.pageSize ?? '20') || 20));

  let where = '1=1';
  const params: (string | number)[] = [];
  if (dateFrom) { where += ' AND ct.transfer_date >= ?'; params.push(dateFrom); }
  if (dateTo) { where += ' AND ct.transfer_date <= ?'; params.push(dateTo); }

  const totalRow = db.prepare(`SELECT COUNT(*) as n FROM cash_transfers ct WHERE ${where}`).get(...params) as { n: number };
  const total = totalRow.n;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const offset = (page - 1) * pageSize;

  const rows = db.prepare(`
    SELECT ct.id, ct.transfer_date, ct.from_account_id, ct.to_account_id, ct.amount, ct.notes, ct.entered_by, ct.created_at,
      fa.name as from_account_name, ta.name as to_account_name
    FROM cash_transfers ct
    LEFT JOIN cash_accounts fa ON fa.id = ct.from_account_id
    LEFT JOIN cash_accounts ta ON ta.id = ct.to_account_id
    WHERE ${where}
    ORDER BY ct.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset) as Array<{
    id: number;
    transfer_date: string;
    from_account_id: number;
    to_account_id: number;
    amount: number;
    notes: string | null;
    entered_by: string | null;
    created_at: string;
    from_account_name: string | null;
    to_account_name: string | null;
  }>;

  // Match CashTransfer type expected by frontend: include from_account / to_account nested objects
  const mapped = rows.map((r) => ({
    id: r.id,
    transfer_date: r.transfer_date,
    from_account_id: r.from_account_id,
    to_account_id: r.to_account_id,
    amount: r.amount,
    notes: r.notes,
    entered_by: r.entered_by,
    created_at: r.created_at,
    from_account: r.from_account_name ? { id: r.from_account_id, name: r.from_account_name } : null,
    to_account: r.to_account_name ? { id: r.to_account_id, name: r.to_account_name } : null,
  }));

  res.json({ rows: mapped, total, page, pageSize, totalPages });
});

cashRouter.post('/transfer', requireAuth, validateBody(z.object({
  from_account_id: z.number().int().positive(),
  to_account_id: z.number().int().positive(),
  amount: z.number().positive(),
  transfer_date: z.string(),
  notes: z.string().nullable().optional(),
  entered_by: z.string().nullable().optional(),
})), (req, res) => {
  const body = req.body as { from_account_id: number; to_account_id: number; amount: number; transfer_date: string; notes?: string | null; entered_by?: string | null };
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

function pktToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
}

cashRouter.post('/correction', requireAuth, validateBody(z.object({
  account_id: z.number().int().positive(),
  target: z.number(),
  correction_date: z.string().optional(),
  name: z.string().min(1),
  reason: z.string().min(1),
  entered_by: z.string().nullable().optional(),
})), (req, res) => {
  const body = req.body as { account_id: number; target: number; correction_date?: string; name: string; reason: string; entered_by?: string | null };
  const correctionDate = body.correction_date || pktToday();
  const trimmedName = (typeof body.name === 'string' ? body.name : '').trim();
  const trimmedReason = (typeof body.reason === 'string' ? body.reason : '').trim();
  if (!trimmedName) throw Object.assign(new Error('Naam likhna zaroori hai (Name is required)'), { status: 400, code: 'BAD_INPUT' });
  if (!trimmedReason) throw Object.assign(new Error('Reason likhna zaroori hai (Reason is required)'), { status: 400, code: 'BAD_INPUT' });
  const result = db.transaction(() => {
    const current = (db.prepare(`SELECT COALESCE(SUM(CASE WHEN direction='in' THEN amount ELSE -amount END), 0) as bal FROM cash_ledger WHERE account_id = ?`).get(body.account_id) as { bal: number }).bal;
    const diff = round2(body.target - current);
    if (diff === 0) return { adjusted: false };
    const dir = diff > 0 ? 'in' : 'out';
    const description = `Manual correction: ${trimmedReason}`;
    db.prepare('INSERT INTO cash_ledger (entry_date, account_id, direction, amount, source_type, description, entered_by) VALUES (?, ?, ?, ?, ?, ?, ?)').run(correctionDate, body.account_id, dir, Math.abs(diff), 'correction', description, trimmedName);
    return { adjusted: true, previous: current, new: body.target, diff };
  })();
  cacheInvalidate('cash_ledger');
  res.status(201).json(result);
});

// GET — list all manual corrections (source_type = 'correction') with account names
cashRouter.get('/correction', requireAuth, (_req, res) => {
  const rows = db.prepare(`
    SELECT cl.id, cl.entry_date, cl.account_id, ca.name as account_name,
           cl.direction, cl.amount, cl.description, cl.entered_by, cl.created_at
    FROM cash_ledger cl
    JOIN cash_accounts ca ON ca.id = cl.account_id
    WHERE cl.source_type = 'correction'
    ORDER BY cl.id DESC
    LIMIT 500
  `).all();
  res.json({ corrections: rows });
});

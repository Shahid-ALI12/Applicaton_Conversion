import { Router } from 'express';
import { z } from 'zod';
import { db, round2 } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { parsePage } from '../utils/pagination.js';
import { cacheInvalidate } from '../utils/cache.js';

export const laboursRouter = Router();

// Labour CRUD
laboursRouter.get('/', requireAuth, (req, res) => {
  const { page, pageSize, search } = parsePage(req.query as Record<string, unknown>);
  let where = '1=1';
  const params: (string | number)[] = [];
  if (search) { where += ' AND (l.name LIKE ? OR l.role LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  const total = (db.prepare(`SELECT COUNT(*) as c FROM labours l WHERE ${where}`).get(...params) as { c: number }).c;
  const rows = db.prepare(`SELECT l.*, loc.name as location_name FROM labours l LEFT JOIN locations loc ON loc.id=l.location_id WHERE ${where} ORDER BY l.id DESC LIMIT ? OFFSET ?`).all(...params, pageSize, (page - 1) * pageSize);
  res.json({ rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
});

laboursRouter.post('/', requireAuth, validateBody(z.object({
  name: z.string().trim().min(1),
  phone: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  daily_wage: z.number().nonnegative().default(0),
  location_id: z.number().int().positive().nullable().optional(),
  is_active: z.boolean().default(true),
})), (req, res) => {
  const body = req.body as { name: string; phone?: string | null; role?: string | null; daily_wage: number; location_id?: number | null; is_active: boolean };
  const r = db.prepare('INSERT INTO labours (name, phone, role, daily_wage, location_id, is_active) VALUES (?, ?, ?, ?, ?, ?)').run(body.name, body.phone ?? null, body.role ?? null, body.daily_wage, body.location_id ?? null, body.is_active ? 1 : 0);
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

laboursRouter.put('/:id', requireAuth, validateBody(z.object({
  name: z.string().trim().min(1).optional(),
  phone: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  daily_wage: z.number().nonnegative().optional(),
  location_id: z.number().int().positive().nullable().optional(),
  is_active: z.boolean().optional(),
})), (req, res) => {
  const id = Number(req.params.id);
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(req.body as Record<string, unknown>)) {
    if (k === 'is_active') { sets.push('is_active = ?'); vals.push(v ? 1 : 0); }
    else { sets.push(`${k} = ?`); vals.push(v); }
  }
  if (sets.length === 0) return res.json({ ok: false });
  vals.push(id);
  db.prepare(`UPDATE labours SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  res.json({ ok: true });
});

// Labour payments
laboursRouter.get('/payments', requireAuth, (req, res) => {
  const labourId = req.query.labourId ? Number(req.query.labourId) : undefined;
  let where = '1=1';
  const params: (string | number)[] = [];
  if (labourId) { where += ' AND lp.labour_id = ?'; params.push(labourId); }
  const rows = db.prepare(`SELECT lp.*, l.name as labour_name FROM labour_payments lp JOIN labours l ON l.id=lp.labour_id WHERE ${where} ORDER BY lp.id DESC LIMIT 200`).all(...params);
  res.json(rows);
});

laboursRouter.post('/payments', requireAuth, validateBody(z.object({
  labour_id: z.number().int().positive(),
  amount: z.number().positive(),
  payment_type: z.enum(['salary', 'advance', 'expense']),
  payment_date: z.string(),
  description: z.string().nullable().optional(),
  entered_by: z.string().nullable().optional(),
})), (req, res) => {
  const body = req.body as { labour_id: number; amount: number; payment_type: string; payment_date: string; description?: string | null; entered_by?: string | null };
  const r = db.prepare('INSERT INTO labour_payments (labour_id, payment_date, amount, payment_type, description, entered_by) VALUES (?, ?, ?, ?, ?, ?)').run(body.labour_id, body.payment_date, round2(body.amount), body.payment_type, body.description ?? null, body.entered_by ?? null);
  // Cash out
  const cashAccount = db.prepare("SELECT id FROM cash_accounts WHERE name = 'Cash In Hand'").get() as { id: number } | undefined;
  if (cashAccount) {
    db.prepare('INSERT INTO cash_ledger (entry_date, account_id, direction, amount, source_type, description) VALUES (?, ?, ?, ?, ?, ?)').run(body.payment_date, cashAccount.id, 'out', round2(body.amount), 'labour_payment', `Labour ${body.payment_type}`);
  }
  cacheInvalidate('cash_ledger');
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

// Daily wages
laboursRouter.get('/daily-wages', requireAuth, (req, res) => {
  const labourId = req.query.labourId ? Number(req.query.labourId) : undefined;
  let where = '1=1';
  const params: (string | number)[] = [];
  if (labourId) { where += ' AND ldw.labour_id = ?'; params.push(labourId); }
  const rows = db.prepare(`SELECT ldw.*, l.name as labour_name FROM labour_daily_wages ldw JOIN labours l ON l.id=ldw.labour_id WHERE ${where} ORDER BY ldw.id DESC LIMIT 200`).all(...params);
  res.json(rows);
});

laboursRouter.post('/daily-wages', requireAuth, validateBody(z.object({
  labour_id: z.number().int().positive(),
  wage_date: z.string(),
  amount: z.number().positive(),
  notes: z.string().nullable().optional(),
  entered_by: z.string().nullable().optional(),
})), (req, res) => {
  const body = req.body as { labour_id: number; wage_date: string; amount: number; notes?: string | null; entered_by?: string | null };
  const r = db.prepare('INSERT OR REPLACE INTO labour_daily_wages (labour_id, wage_date, amount, notes, entered_by) VALUES (?, ?, ?, ?, ?)').run(body.labour_id, body.wage_date, round2(body.amount), body.notes ?? null, body.entered_by ?? null);
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

// Monthly summary
laboursRouter.get('/monthly-summary', requireAuth, (req, res) => {
  const month = req.query.month as string; // YYYY-MM
  if (!month) return res.json([]);
  const rows = db.prepare(`
    SELECT l.id as labour_id, l.name, l.daily_wage,
      COALESCE((SELECT SUM(ldw.amount) FROM labour_daily_wages ldw WHERE ldw.labour_id=l.id AND strftime('%Y-%m', ldw.wage_date)=?), 0) as total_earned,
      COALESCE((SELECT SUM(lp.amount) FROM labour_payments lp WHERE lp.labour_id=l.id AND strftime('%Y-%m', lp.payment_date)=?), 0) as total_paid
    FROM labours l WHERE l.is_active=1 ORDER BY l.name
  `).all(month, month);
  res.json(rows);
});

/**
 * Flat labour endpoints — mirrors Testing_Project's URL shape so the
 * labour-khata.tsx page (copied from Testing_Project) works without
 * page-side URL rewrites.
 *
 * Existing nested routes in `./labours.ts` (`/api/labours/payments`,
 * `/api/labours/daily-wages`, `/api/labours/monthly-summary`) remain
 * unchanged for backward compatibility.
 *
 * Endpoints provided here:
 *   GET    /api/labour-payments              -> raw array of payments
 *   POST   /api/labour-payments              -> { id }
 *   DELETE /api/labour-payments/:id          -> { ok: true }
 *
 *   GET    /api/labour-daily-wages           -> { wages: [...] }
 *   POST   /api/labour-daily-wages           -> { id } (upsert when ?upsert=true)
 *
 *   GET    /api/labour-monthly-summary       -> { summaries: [...] }
 */
import { Router } from 'express';
import { z } from 'zod';
import { db, round2 } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { cacheInvalidate } from '../utils/cache.js';

export const labourExtrasRouter = Router();

// ─────────────────────────────────────────────────────────────────────────────
// /api/labour-payments
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/labour-payments
 *
 * Query params (all optional):
 *   labour_id=<number>      Filter by labour
 *   payment_date=<YYYY-MM-DD>  Exact date match
 *   from=<YYYY-MM-DD>       payment_date >=
 *   to=<YYYY-MM-DD>         payment_date <=
 *   type=<salary|advance|expense>
 *   include_labour=true     Hint flag (we always JOIN the labour name)
 *   location_id=<number>    Filter by labour's location
 *
 * Response: raw array of payment rows (page checks Array.isArray(body)).
 */
labourExtrasRouter.get('/labour-payments', requireAuth, (req, res) => {
  const q = req.query as Record<string, string | undefined>;

  const labourId = q.labour_id ? Number(q.labour_id) : undefined;
  const paymentDate = q.payment_date;
  const from = q.from;
  const to = q.to;
  const type = q.type;
  const locationId = q.location_id ? Number(q.location_id) : undefined;

  const where: string[] = ['1=1'];
  const params: (string | number)[] = [];

  if (labourId && Number.isFinite(labourId)) {
    where.push('lp.labour_id = ?');
    params.push(labourId);
  }
  if (paymentDate) {
    where.push('lp.payment_date = ?');
    params.push(paymentDate);
  }
  if (from) {
    where.push('lp.payment_date >= ?');
    params.push(from);
  }
  if (to) {
    where.push('lp.payment_date <= ?');
    params.push(to);
  }
  if (type && ['salary', 'advance', 'expense'].includes(type)) {
    where.push('lp.payment_type = ?');
    params.push(type);
  }
  if (locationId && Number.isFinite(locationId) && locationId > 0) {
    where.push('l.location_id = ?');
    params.push(locationId);
  }

  const sql = `
    SELECT lp.*, l.name AS labour_name, l.role AS labour_role,
           loc.name AS location_name
    FROM labour_payments lp
    JOIN labours l ON l.id = lp.labour_id
    LEFT JOIN locations loc ON loc.id = l.location_id
    WHERE ${where.join(' AND ')}
    ORDER BY lp.payment_date DESC, lp.id DESC
    LIMIT 500
  `;
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

const createPaymentSchema = z.object({
  labour_id: z.number().int().positive(),
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'payment_date must be YYYY-MM-DD'),
  amount: z.number().positive(),
  payment_type: z.enum(['salary', 'advance', 'expense']).default('salary'),
  description: z.string().nullable().optional(),
  entered_by: z.string().nullable().optional(),
});

/**
 * POST /api/labour-payments
 * Body: { labour_id, payment_date, amount, payment_type?, description? }
 * Response: { id }
 */
labourExtrasRouter.post('/labour-payments', requireAuth, validateBody(createPaymentSchema), (req, res) => {
  const body = req.body as {
    labour_id: number;
    payment_date: string;
    amount: number;
    payment_type: 'salary' | 'advance' | 'expense';
    description?: string | null;
    entered_by?: string | null;
  };

  const r = db.prepare(
    'INSERT INTO labour_payments (labour_id, payment_date, amount, payment_type, description, entered_by) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    body.labour_id,
    body.payment_date,
    round2(body.amount),
    body.payment_type,
    body.description ?? null,
    body.entered_by ?? null,
  );

  // Cash out (only for expense / advance types — salary is treated as separate payroll)
  // We mirror the existing nested handler: it deducts from "Cash In Hand" for all
  // types, so we keep parity here.
  const cashAccount = db.prepare("SELECT id FROM cash_accounts WHERE name = 'Cash In Hand'").get() as
    | { id: number }
    | undefined;
  if (cashAccount) {
    db.prepare(
      'INSERT INTO cash_ledger (entry_date, account_id, direction, amount, source_type, description) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      body.payment_date,
      cashAccount.id,
      'out',
      round2(body.amount),
      'labour_payment',
      `Labour ${body.payment_type}`,
    );
  }
  cacheInvalidate('cash_ledger');
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

/**
 * DELETE /api/labour-payments/:id
 * Response: { ok: true }
 */
labourExtrasRouter.delete('/labour-payments/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'id must be a number' } });
  }
  const existing = db.prepare('SELECT id FROM labour_payments WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Labour payment not found' } });
  }
  db.prepare('DELETE FROM labour_payments WHERE id = ?').run(id);
  cacheInvalidate('cash_ledger');
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// /api/labour-daily-wages
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/labour-daily-wages
 *
 * Query params (all optional):
 *   wage_date=<YYYY-MM-DD>   Filter by exact date
 *   labour_id=<number>       Filter by labour
 *   include_labour=true      Hint flag (we always JOIN)
 *
 * Response: { wages: [...] } — page reads `data.wages`.
 */
labourExtrasRouter.get('/labour-daily-wages', requireAuth, (req, res) => {
  const q = req.query as Record<string, string | undefined>;

  const wageDate = q.wage_date;
  const labourId = q.labour_id ? Number(q.labour_id) : undefined;

  const where: string[] = ['1=1'];
  const params: (string | number)[] = [];

  if (wageDate) {
    where.push('ldw.wage_date = ?');
    params.push(wageDate);
  }
  if (labourId && Number.isFinite(labourId)) {
    where.push('ldw.labour_id = ?');
    params.push(labourId);
  }

  const sql = `
    SELECT ldw.*, l.name AS labour_name, l.role AS labour_role,
           loc.name AS location_name
    FROM labour_daily_wages ldw
    JOIN labours l ON l.id = ldw.labour_id
    LEFT JOIN locations loc ON loc.id = l.location_id
    WHERE ${where.join(' AND ')}
    ORDER BY ldw.wage_date DESC, l.name ASC
    LIMIT 500
  `;
  const rows = db.prepare(sql).all(...params);
  res.json({ wages: rows });
});

const createWageSchema = z.object({
  labour_id: z.number().int().positive(),
  wage_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'wage_date must be YYYY-MM-DD'),
  amount: z.number().nonnegative(),
  notes: z.string().nullable().optional(),
  entered_by: z.string().nullable().optional(),
  upsert: z.boolean().optional(),
});

/**
 * POST /api/labour-daily-wages
 * Body: { labour_id, wage_date, amount, notes?, upsert? }
 * Response: { id }
 *
 * When `upsert: true`, performs INSERT OR REPLACE on the (labour_id, wage_date)
 * unique key — this matches the page's "Save All Wages" batch upsert flow.
 */
labourExtrasRouter.post('/labour-daily-wages', requireAuth, validateBody(createWageSchema), (req, res) => {
  const body = req.body as {
    labour_id: number;
    wage_date: string;
    amount: number;
    notes?: string | null;
    entered_by?: string | null;
    upsert?: boolean;
  };

  const stmtText = body.upsert
    ? 'INSERT OR REPLACE INTO labour_daily_wages (labour_id, wage_date, amount, notes, entered_by) VALUES (?, ?, ?, ?, ?)'
    : 'INSERT INTO labour_daily_wages (labour_id, wage_date, amount, notes, entered_by) VALUES (?, ?, ?, ?, ?)';
  const r = db.prepare(stmtText).run(
    body.labour_id,
    body.wage_date,
    round2(body.amount),
    body.notes ?? null,
    body.entered_by ?? null,
  );
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

// ─────────────────────────────────────────────────────────────────────────────
// /api/labour-monthly-summary
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/labour-monthly-summary?month=YYYY-MM
 *
 * Response: { summaries: [...] } — page reads `data.summaries`.
 * Each row: { labour_id, name, daily_wage, total_earned, total_paid }
 */
labourExtrasRouter.get('/labour-monthly-summary', requireAuth, (req, res) => {
  const month = req.query.month as string | undefined;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return res.json({ summaries: [] });
  }

  const rows = db.prepare(`
    SELECT l.id AS labour_id, l.name, l.daily_wage,
      COALESCE((
        SELECT SUM(ldw.amount) FROM labour_daily_wages ldw
        WHERE ldw.labour_id = l.id AND strftime('%Y-%m', ldw.wage_date) = ?
      ), 0) AS total_earned,
      COALESCE((
        SELECT SUM(lp.amount) FROM labour_payments lp
        WHERE lp.labour_id = l.id AND strftime('%Y-%m', lp.payment_date) = ?
      ), 0) AS total_paid
    FROM labours l
    WHERE l.is_active = 1
    ORDER BY l.name ASC
  `).all(month, month);

  res.json({ summaries: rows });
});

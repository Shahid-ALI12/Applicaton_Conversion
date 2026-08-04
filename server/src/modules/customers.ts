import { Router } from 'express';
import { z } from 'zod';
import { db, round2 } from '../db/connection.js';
import { AppError } from '../errors.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { parsePage } from '../utils/pagination.js';
import { cacheInvalidate } from '../utils/cache.js';
import { getCustomerBalance } from '../services/balances.js';

export const customersRouter = Router();

// LIST with balance
customersRouter.get('/', requireAuth, (req, res) => {
  const { page, pageSize, search } = parsePage(req.query as Record<string, unknown>);
  let where = 'deleted_at IS NULL';
  const params: (string | number)[] = [];
  if (search) {
    where += ' AND (name LIKE ? OR phone LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  const total = (db.prepare(`SELECT COUNT(*) as c FROM customers WHERE ${where}`).get(...params) as { c: number }).c;
  const offset = (page - 1) * pageSize;
  const rows = db.prepare(
    `SELECT id, name, type, phone, is_active, opening_balance, advance_payment, deleted_at, created_at FROM customers WHERE ${where} ORDER BY name ASC LIMIT ? OFFSET ?`
  ).all(...params, pageSize, offset) as Record<string, unknown>[];

  const enriched = rows.map((c) => {
    const balance = getCustomerBalance(Number(c.id));
    return {
      ...c,
      opening_balance: round2(Number(c.opening_balance)),
      advance_payment: round2(Number(c.advance_payment)),
      net_balance: balance?.balance_due ?? 0,
    };
  });

  res.json({ rows: enriched, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
});

// GET by ID with balance
customersRouter.get('/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const customer = db.prepare(
    'SELECT id, name, type, phone, is_active, opening_balance, advance_payment, deleted_at, created_at FROM customers WHERE id = ?'
  ).get(id) as Record<string, unknown> | undefined;

  if (!customer) throw AppError.notFound('Customer');

  const balance = getCustomerBalance(id);
  res.json({
    ...customer,
    opening_balance: round2(Number(customer.opening_balance)),
    advance_payment: round2(Number(customer.advance_payment)),
    net_balance: balance.balance_due,
  });
});

// CREATE
const createCustomerSchema = z.object({
  name: z.string().trim().min(1),
  type: z.enum(['credit', 'cash']).default('credit'),
  phone: z.string().nullable().optional(),
  opening_balance: z.number().nonnegative().default(0),
  advance_payment: z.number().nonnegative().default(0),
  is_active: z.boolean().default(true),
});

customersRouter.post('/', requireAuth, validateBody(createCustomerSchema), (req, res) => {
  const body = req.body as { name: string; type: string; phone?: string | null; opening_balance: number; advance_payment: number; is_active: boolean };
  const r = db.prepare(
    'INSERT INTO customers (name, type, phone, is_active, opening_balance, advance_payment) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(body.name, body.type, body.phone ?? null, body.is_active ? 1 : 0, round2(body.opening_balance), round2(body.advance_payment));
  cacheInvalidate('customers');
  const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(Number(r.lastInsertRowid));
  res.status(201).json(row);
});

// UPDATE
const updateCustomerSchema = z.object({
  name: z.string().trim().min(1).optional(),
  type: z.enum(['credit', 'cash']).optional(),
  phone: z.string().nullable().optional(),
  opening_balance: z.number().nonnegative().optional(),
  advance_payment: z.number().nonnegative().optional(),
  is_active: z.boolean().optional(),
});

customersRouter.put('/:id', requireAuth, validateBody(updateCustomerSchema), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM customers WHERE id = ?').get(id);
  if (!existing) throw AppError.notFound('Customer');

  const parsed = (req.body as Record<string, unknown>);
  const cols: string[] = [];
  const vals: (string | number | null)[] = [];
  for (const [key, value] of Object.entries(parsed)) {
    if (value !== undefined) {
      cols.push(key);
      if (key === 'opening_balance' || key === 'advance_payment') vals.push(round2(Number(value)));
      else if (key === 'is_active') vals.push(value ? 1 : 0);
      else vals.push(value as string | number | null);
    }
  }
  if (cols.length === 0) {
    const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    res.json(row);
    return;
  }
  const sets = cols.map(c => `${c} = ?`).join(', ');
  db.prepare(`UPDATE customers SET ${sets} WHERE id = ?`).run(...vals, id);
  cacheInvalidate('customers');
  const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  res.json(row);
});

// DELETE (soft — set deleted_at)
customersRouter.delete('/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM customers WHERE id = ?').get(id);
  if (!existing) throw AppError.notFound('Customer');
  db.prepare("UPDATE customers SET deleted_at = datetime('now') WHERE id = ?").run(id);
  cacheInvalidate('customers');
  res.json({ ok: true, id, deleted: true });
});

// PUT /:id/restore — restore soft-deleted customer
customersRouter.put('/:id/restore', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM customers WHERE id = ?').get(id);
  if (!existing) throw AppError.notFound('Customer');
  db.prepare('UPDATE customers SET deleted_at = NULL WHERE id = ?').run(id);
  cacheInvalidate('customers');
  const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  res.json(row);
});

// DELETE /:id/permanent — hard delete
customersRouter.delete('/:id/permanent', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const result = db.prepare('DELETE FROM customers WHERE id = ?').run(id);
  if (result.changes === 0) throw AppError.notFound('Customer');
  cacheInvalidate('customers');
  res.json({ ok: true });
});

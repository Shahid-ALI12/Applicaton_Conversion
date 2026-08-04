import { Router } from 'express';
import { z } from 'zod';
import { db, round2 } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { cacheInvalidate } from '../utils/cache.js';
import { getCustomerBalance } from '../services/balances.js';
import { parsePage } from '../utils/pagination.js';

export const customerPaymentsRouter = Router();

customerPaymentsRouter.get('/', requireAuth, (req, res) => {
  const { page, pageSize, search } = parsePage(req.query as Record<string, unknown>);
  const customerId = req.query.customerId ? Number(req.query.customerId) : undefined;
  let where = '1=1';
  const params: (string | number)[] = [];
  if (customerId) { where += ' AND cp.customer_id = ?'; params.push(customerId); }
  if (search) { where += ' AND c.name LIKE ?'; params.push(`%${search}%`); }
  const total = (db.prepare(`SELECT COUNT(*) as c FROM customer_payments cp JOIN customers c ON c.id=cp.customer_id WHERE ${where}`).get(...params) as { c: number }).c;
  const rows = db.prepare(`SELECT cp.*, c.name as customer_name FROM customer_payments cp JOIN customers c ON c.id=cp.customer_id WHERE ${where} ORDER BY cp.id DESC LIMIT ? OFFSET ?`).all(...params, pageSize, (page - 1) * pageSize);
  res.json({ rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
});

customerPaymentsRouter.post('/', requireAuth, validateBody(z.object({
  customer_id: z.number().int().positive(),
  amount: z.number().positive(),
  payment_date: z.string(),
  notes: z.string().nullable().optional(),
  entered_by: z.string().nullable().optional(),
})), (req, res) => {
  const body = req.body as { customer_id: number; amount: number; payment_date: string; notes?: string | null; entered_by?: string | null };
  const result = db.transaction(() => {
    const cust = db.prepare('SELECT opening_balance, advance_payment FROM customers WHERE id = ?').get(body.customer_id) as { opening_balance: number; advance_payment: number };
    const openingBefore = cust.opening_balance;
    const advanceBefore = cust.advance_payment ?? 0;

    let appliedOpening = 0;
    let appliedAdvance = 0;
    let newOpening = openingBefore;
    let newAdvance = advanceBefore;

    // First apply to opening balance
    if (openingBefore > 0) {
      appliedOpening = Math.min(body.amount, openingBefore);
      newOpening = round2(openingBefore - appliedOpening);
    }
    const remaining = round2(body.amount - appliedOpening);
    if (remaining > 0) {
      appliedAdvance = remaining;
      newAdvance = round2(advanceBefore + appliedAdvance);
    }

    db.prepare('UPDATE customers SET opening_balance = ?, advance_payment = ? WHERE id = ?').run(newOpening, newAdvance, body.customer_id);

    const r = db.prepare('INSERT INTO customer_payments (customer_id, payment_date, amount, applied_to_opening, applied_to_advance, opening_balance_before, opening_balance_after, advance_before, advance_after, notes, entered_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      body.customer_id, body.payment_date, round2(body.amount), round2(appliedOpening), round2(appliedAdvance),
      openingBefore, newOpening, advanceBefore, newAdvance, body.notes ?? null, body.entered_by ?? null,
    );

    // Cash in
    const cashAccount = db.prepare("SELECT id FROM cash_accounts WHERE name = 'Cash In Hand'").get() as { id: number } | undefined;
    if (cashAccount) {
      db.prepare('INSERT INTO cash_ledger (entry_date, account_id, direction, amount, source_type, description) VALUES (?, ?, ?, ?, ?, ?)').run(body.payment_date, cashAccount.id, 'in', round2(body.amount), 'customer_payment', `Payment from customer #${body.customer_id}`);
    }

    return { id: Number(r.lastInsertRowid), applied_to_opening: appliedOpening, applied_to_advance: appliedAdvance };
  })();

  cacheInvalidate('customer_payments');
  cacheInvalidate('cash_ledger');
  res.status(201).json(result);
});

// DELETE /:id
customerPaymentsRouter.delete('/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM customer_payments WHERE id = ?').get(id);
  if (!existing) throw new Error('Customer payment not found');
  db.prepare('DELETE FROM customer_payments WHERE id = ?').run(id);
  cacheInvalidate('customer_payments');
  cacheInvalidate('cash_ledger');
  res.json({ ok: true });
});

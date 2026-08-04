import { Router } from 'express';
import { z } from 'zod';
import { db, round2 } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { parsePage } from '../utils/pagination.js';
import { cacheInvalidate } from '../utils/cache.js';

export const expensesRouter = Router();

expensesRouter.get('/', requireAuth, (req, res) => {
  const { page, pageSize, search } = parsePage(req.query as Record<string, unknown>);
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;
  let where = '1=1';
  const params: (string | number)[] = [];
  if (dateFrom) { where += ' AND expense_date >= ?'; params.push(dateFrom); }
  if (dateTo) { where += ' AND expense_date <= ?'; params.push(dateTo); }
  if (search) { where += ' AND description LIKE ?'; params.push(`%${search}%`); }
  const total = (db.prepare(`SELECT COUNT(*) as c FROM expenses WHERE ${where}`).get(...params) as { c: number }).c;
  const rows = db.prepare(`SELECT * FROM expenses WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, pageSize, (page - 1) * pageSize);
  res.json({ rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
});

expensesRouter.post('/', requireAuth, validateBody(z.object({
  description: z.string().trim().min(1),
  amount: z.number().nonnegative(),
  expense_date: z.string(),
  entered_by: z.string().nullable().optional(),
})), (req, res) => {
  const { description, amount, expense_date, entered_by } = req.body as { description: string; amount: number; expense_date: string; entered_by?: string | null };
  const result = db.transaction(() => {
    const r = db.prepare('INSERT INTO expenses (description, amount, expense_date, entered_by) VALUES (?, ?, ?, ?)').run(description, round2(amount), expense_date, entered_by ?? null);
    const expenseId = Number(r.lastInsertRowid);
    const cashAccount = db.prepare("SELECT id FROM cash_accounts WHERE name = 'Cash In Hand'").get() as { id: number } | undefined;
    if (cashAccount) {
      db.prepare('INSERT INTO cash_ledger (entry_date, account_id, direction, amount, source_type, source_id, description) VALUES (?, ?, ?, ?, ?, ?, ?)').run(expense_date, cashAccount.id, 'out', round2(amount), 'expense', expenseId, description);
    }
    return { id: expenseId };
  })();
  cacheInvalidate('expenses');
  cacheInvalidate('cash_ledger');
  res.status(201).json(result);
});

expensesRouter.delete('/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM expenses WHERE id = ?').run(Number(req.params.id));
  cacheInvalidate('expenses');
  res.json({ ok: true });
});

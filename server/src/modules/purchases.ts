import { Router } from 'express';
import { z } from 'zod';
import { db, round2 } from '../db/connection.js';
import { AppError } from '../errors.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { parsePage } from '../utils/pagination.js';
import { cacheInvalidate } from '../utils/cache.js';
import { incrementStock } from '../services/stock.js';

export const purchasesRouter = Router();

purchasesRouter.get('/', requireAuth, (req, res) => {
  const { page, pageSize, search } = parsePage(req.query as Record<string, unknown>);
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;

  let where = '1=1';
  const params: (string | number)[] = [];
  if (dateFrom) { where += ' AND p.purchase_date >= ?'; params.push(dateFrom); }
  if (dateTo) { where += ' AND p.purchase_date <= ?'; params.push(dateTo); }
  if (search) { where += ' AND (pr.name LIKE ? OR s.name LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

  const total = (db.prepare(`SELECT COUNT(*) as c FROM purchases p JOIN products pr ON pr.id=p.product_id LEFT JOIN suppliers s ON s.id=p.supplier_id WHERE ${where}`).get(...params) as { c: number }).c;
  const rows = db.prepare(`
    SELECT p.*, pr.name as product_name, s.name as supplier_name, l.name as location_name
    FROM purchases p
    JOIN products pr ON pr.id=p.product_id
    LEFT JOIN suppliers s ON s.id=p.supplier_id
    JOIN locations l ON l.id=p.location_id
    WHERE ${where}
    ORDER BY p.id DESC LIMIT ? OFFSET ?
  `).all(...params, pageSize, (page - 1) * pageSize);

  res.json({ rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
});

purchasesRouter.post('/', requireAuth, validateBody(z.object({
  purchase_date: z.string(),
  product_id: z.number().int().positive(),
  quantity: z.number().positive(),
  rate_per_bag: z.number().nonnegative(),
  supplier_id: z.number().int().positive().nullable().optional(),
  settled_by_customer_id: z.number().int().positive().nullable().optional(),
  cash_paid: z.number().nonnegative().default(0),
  location_id: z.number().int().positive(),
  notes: z.string().nullable().optional(),
  unit_type: z.enum(['bags', 'kg']).default('bags'),
  bag_weight_kg: z.number().nonnegative().nullable().optional(),
  entered_by: z.string().nullable().optional(),
})), (req, res) => {
  const body = req.body as {
    purchase_date: string; product_id: number; quantity: number; rate_per_bag: number;
    supplier_id?: number | null; settled_by_customer_id?: number | null;
    cash_paid: number; location_id: number; notes?: string | null;
    unit_type: string; bag_weight_kg?: number | null; entered_by?: string | null;
  };

  const result = db.transaction(() => {
    const r = db.prepare(`
      INSERT INTO purchases (purchase_date, product_id, quantity, rate_per_bag, supplier_id, settled_by_customer_id, cash_paid, location_id, notes, unit_type, bag_weight_kg, entered_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(body.purchase_date, body.product_id, body.quantity, round2(body.rate_per_bag), body.supplier_id ?? null, body.settled_by_customer_id ?? null, round2(body.cash_paid), body.location_id, body.notes ?? null, body.unit_type, body.bag_weight_kg ?? null, body.entered_by ?? null);
    const purchaseId = Number(r.lastInsertRowid);

    // Increment stock for bags
    if (body.unit_type === 'bags') {
      incrementStock(body.product_id, body.location_id, body.quantity, body.bag_weight_kg ?? null);
    }

    // Cash out (not for goods settlement)
    if (!body.settled_by_customer_id && body.cash_paid > 0) {
      const cashAccount = db.prepare("SELECT id FROM cash_accounts WHERE name = 'Cash In Hand'").get() as { id: number } | undefined;
      if (cashAccount) {
        db.prepare('INSERT INTO cash_ledger (entry_date, account_id, direction, amount, source_type, source_id, description) VALUES (?, ?, ?, ?, ?, ?, ?)').run(body.purchase_date, cashAccount.id, 'out', round2(body.cash_paid), 'purchase', purchaseId, `Purchase #${purchaseId}`);
      }
    }

    return { id: purchaseId };
  })();

  cacheInvalidate('purchases');
  cacheInvalidate('product_stock');
  cacheInvalidate('cash_ledger');
  res.status(201).json(result);
});

purchasesRouter.delete('/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM purchases WHERE id = ?').run(id);
  cacheInvalidate('purchases');
  res.json({ ok: true });
});

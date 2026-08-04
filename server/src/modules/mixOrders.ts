import { Router } from 'express';
import { z } from 'zod';
import { db, round2 } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { decrementStock } from '../services/stock.js';
import { cacheInvalidate } from '../utils/cache.js';
import { parsePage } from '../utils/pagination.js';

export const mixOrdersRouter = Router();

mixOrdersRouter.get('/', requireAuth, (req, res) => {
  const { page, pageSize, search } = parsePage(req.query as Record<string, unknown>);
  let where = '1=1';
  const params: (string | number)[] = [];
  if (search) { where += ' AND c.name LIKE ?'; params.push(`%${search}%`); }
  const total = (db.prepare(`SELECT COUNT(*) as c FROM mix_orders m JOIN customers c ON c.id=m.customer_id WHERE ${where}`).get(...params) as { c: number }).c;
  const rows = db.prepare(`
    SELECT m.*, c.name as customer_name, l.name as location_name
    FROM mix_orders m JOIN customers c ON c.id=m.customer_id JOIN locations l ON l.id=m.location_id
    WHERE ${where} ORDER BY m.id DESC LIMIT ? OFFSET ?
  `).all(...params, pageSize, (page - 1) * pageSize);
  res.json({ rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
});

const mixItemSchema = z.object({
  product_id: z.number().int().positive(),
  quantity: z.number().positive(),
  rate_per_kg: z.number().nonnegative(),
});

mixOrdersRouter.post('/', requireAuth, validateBody(z.object({
  customer_id: z.number().int().positive(),
  location_id: z.number().int().positive(),
  order_date: z.string(),
  target_weight_kg: z.number().nonnegative().nullable().optional(),
  cash_received: z.number().nonnegative().default(0),
  driver_name: z.string().nullable().optional(),
  driver_rent: z.number().nonnegative().default(0),
  entered_by: z.string().nullable().optional(),
  items: z.array(mixItemSchema).min(1),
})), (req, res) => {
  const body = req.body as {
    customer_id: number; location_id: number; order_date: string;
    target_weight_kg?: number | null; cash_received: number;
    driver_name?: string | null; driver_rent: number; entered_by?: string | null;
    items: { product_id: number; quantity: number; rate_per_kg: number }[];
  };

  const result = db.transaction(() => {
    const r = db.prepare('INSERT INTO mix_orders (customer_id, location_id, order_date, target_weight_kg, cash_received, driver_name, driver_rent, entered_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(body.customer_id, body.location_id, body.order_date, body.target_weight_kg ?? null, round2(body.cash_received), body.driver_name ?? null, round2(body.driver_rent), body.entered_by ?? null);
    const mixId = Number(r.lastInsertRowid);

    for (const item of body.items) {
      decrementStock(item.product_id, body.location_id, item.quantity);
      db.prepare('INSERT INTO sales (customer_id, product_id, location_id, quantity, rate_per_bag, sale_date, unit_type, mix_order_id, entered_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(body.customer_id, item.product_id, body.location_id, item.quantity, round2(item.rate_per_kg), body.order_date, 'kg', mixId, body.entered_by ?? null);
    }

    if (body.cash_received > 0) {
      const cashAccount = db.prepare("SELECT id FROM cash_accounts WHERE name = 'Cash In Hand'").get() as { id: number } | undefined;
      if (cashAccount) {
        db.prepare('INSERT INTO cash_ledger (entry_date, account_id, direction, amount, source_type, description) VALUES (?, ?, ?, ?, ?, ?)').run(body.order_date, cashAccount.id, 'in', round2(body.cash_received), 'sale', `Mix order #${mixId}`);
      }
    }

    return { id: mixId };
  })();

  cacheInvalidate('mix_orders');
  cacheInvalidate('sales');
  cacheInvalidate('product_stock');
  cacheInvalidate('cash_ledger');
  res.status(201).json(result);
});

mixOrdersRouter.delete('/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM mix_orders WHERE id = ?').run(Number(req.params.id));
  cacheInvalidate('mix_orders');
  res.json({ ok: true });
});

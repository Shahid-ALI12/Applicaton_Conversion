import { Router } from 'express';
import { z } from 'zod';
import { db, round2 } from '../db/connection.js';
import { AppError } from '../errors.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { parsePage } from '../utils/pagination.js';
import { cacheInvalidate } from '../utils/cache.js';
import { decrementStock } from '../services/stock.js';

export const salesRouter = Router();

salesRouter.get('/', requireAuth, (req, res) => {
  const { page, pageSize, search } = parsePage(req.query as Record<string, unknown>);
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;
  const customerId = req.query.customerId ? Number(req.query.customerId) : undefined;

  let where = '1=1';
  const params: (string | number)[] = [];
  if (dateFrom) { where += ' AND s.sale_date >= ?'; params.push(dateFrom); }
  if (dateTo) { where += ' AND s.sale_date <= ?'; params.push(dateTo); }
  if (customerId) { where += ' AND s.customer_id = ?'; params.push(customerId); }
  if (search) { where += ' AND (c.name LIKE ? OR p.name LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

  const total = (db.prepare(`SELECT COUNT(*) as c FROM sales s JOIN customers c ON c.id=s.customer_id JOIN products p ON p.id=s.product_id WHERE ${where}`).get(...params) as { c: number }).c;
  const rows = db.prepare(`
    SELECT s.*, c.name as customer_name, p.name as product_name, l.name as location_name
    FROM sales s
    JOIN customers c ON c.id=s.customer_id
    JOIN products p ON p.id=s.product_id
    JOIN locations l ON l.id=s.location_id
    WHERE ${where}
    ORDER BY s.id DESC LIMIT ? OFFSET ?
  `).all(...params, pageSize, (page - 1) * pageSize);

  res.json({ rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
});

const saleItemSchema = z.object({
  product_id: z.number().int().positive(),
  quantity: z.number().positive(),
  rate_per_bag: z.number().nonnegative(),
  unit_type: z.enum(['bags', 'kg']),
  bag_weight_kg: z.number().nonnegative().nullable().optional(),
});

salesRouter.post('/', requireAuth, validateBody(z.object({
  customer_id: z.number().int().positive(),
  location_id: z.number().int().positive(),
  sale_date: z.string(),
  items: z.array(saleItemSchema).min(1),
  cash_received: z.number().nonnegative().default(0),
  rickshaw_fare: z.number().nonnegative().default(0),
  rickshaw_driver_name: z.string().nullable().optional(),
  entered_by: z.string().nullable().optional(),
})), (req, res) => {
  const body = req.body as {
    customer_id: number; location_id: number; sale_date: string;
    items: { product_id: number; quantity: number; rate_per_bag: number; unit_type: string; bag_weight_kg?: number | null }[];
    cash_received: number; rickshaw_fare: number; rickshaw_driver_name?: string; entered_by?: string;
  };

  const transaction = db.transaction(() => {
    // Allocate group ID
    const counter = db.prepare("SELECT value FROM counters WHERE key = 'sale_group'").get() as { value: number } | undefined;
    const nextVal = (counter?.value ?? 0) + 1;
    db.prepare("INSERT OR REPLACE INTO counters (key, value) VALUES ('sale_group', ?)").run(nextVal);
    const groupId = `SG-${String(nextVal).padStart(5, '0')}`;

    const saleIds: number[] = [];
    for (const item of body.items) {
      // Decrement stock for bag-type items
      if (item.unit_type === 'bags') {
        decrementStock(item.product_id, body.location_id, item.quantity, item.bag_weight_kg ?? null);
      }
      const r = db.prepare(`
        INSERT INTO sales (customer_id, product_id, location_id, quantity, rate_per_bag, sale_date, unit_type, bag_weight_kg, transaction_group_id, rickshaw_driver_name, entered_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(body.customer_id, item.product_id, body.location_id, item.quantity, round2(item.rate_per_bag), body.sale_date, item.unit_type, item.bag_weight_kg ?? null, groupId, body.rickshaw_driver_name ?? null, body.entered_by ?? null);
      saleIds.push(Number(r.lastInsertRowid));
    }

    // Cash ledger entry
    if (body.cash_received > 0) {
      const cashAccount = db.prepare("SELECT id FROM cash_accounts WHERE name = 'Cash In Hand'").get() as { id: number } | undefined;
      if (cashAccount) {
        db.prepare('INSERT INTO cash_ledger (entry_date, account_id, direction, amount, source_type, description) VALUES (?, ?, ?, ?, ?, ?)').run(body.sale_date, cashAccount.id, 'in', round2(body.cash_received), 'sale', `Sale group ${groupId}`);
      }
    }

    return { groupId, saleIds };
  });

  const result = transaction();
  cacheInvalidate('sales');
  cacheInvalidate('product_stock');
  cacheInvalidate('cash_ledger');
  res.status(201).json(result);
});

salesRouter.delete('/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(id);
  if (!sale) throw AppError.notFound();
  db.prepare('DELETE FROM sales WHERE id = ?').run(id);
  cacheInvalidate('sales');
  res.json({ ok: true });
});

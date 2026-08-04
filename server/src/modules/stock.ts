import { Router } from 'express';
import { db } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { getStockBalance } from '../services/stock.js';
import { parsePage } from '../utils/pagination.js';
import { cacheInvalidate } from '../utils/cache.js';
import { z } from 'zod';

export const stockRouter = Router();

// GET / - All stock balances (with JOINs for product/location names)
stockRouter.get('/', requireAuth, (req, res) => {
  const { search } = parsePage(req.query as Record<string, unknown>);
  let sql = `
    SELECT ps.id, ps.product_id, p.name as product_name, ps.location_id, l.name as location_name,
           ps.stock_quantity, ps.last_bag_weight_kg
    FROM product_stock ps
    JOIN products p ON p.id = ps.product_id
    JOIN locations l ON l.id = ps.location_id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];
  if (search) {
    sql += ' AND p.name LIKE ?';
    params.push(`%${search}%`);
  }
  sql += ' ORDER BY p.name ASC, l.name ASC';
  const rows = db.prepare(sql).all(...params);
  res.json({ rows, total: rows.length });
});

// GET /:productId - Stock for a specific product across all locations
stockRouter.get('/:productId', requireAuth, (req, res) => {
  const productId = Number(req.params.productId);
  if (isNaN(productId)) throw new Error('Invalid product ID');
  const summary = getStockBalance(productId);
  res.json(summary);
});

// POST / - Create or update stock record
stockRouter.post('/', requireAuth, validateBody(z.object({
  product_id: z.number().int().positive(),
  location_id: z.number().int().positive(),
  stock_quantity: z.number().default(0),
})), (req, res) => {
  const { product_id, location_id, stock_quantity } = req.body as { product_id: number; location_id: number; stock_quantity: number };
  db.prepare(`
    INSERT INTO product_stock (product_id, location_id, stock_quantity)
    VALUES (?, ?, ?)
    ON CONFLICT (product_id, location_id) DO UPDATE SET stock_quantity = excluded.stock_quantity
  `).run(product_id, location_id, stock_quantity);
  cacheInvalidate('product_stock');
  const row = getStockBalance(product_id, location_id);
  res.status(201).json(row);
});

// PUT /:id - Update stock quantity
stockRouter.put('/:id', requireAuth, validateBody(z.object({
  stock_quantity: z.number().optional(),
  last_bag_weight_kg: z.number().nullable().optional(),
})), (req, res) => {
  const id = Number(req.params.id);
  const body = req.body as Record<string, unknown>;
  const sets: string[] = [];
  const vals: (string | number | null)[] = [];
  if (body.stock_quantity !== undefined) { sets.push('stock_quantity = ?'); vals.push(body.stock_quantity as number); }
  if (body.last_bag_weight_kg !== undefined) { sets.push('last_bag_weight_kg = ?'); vals.push(body.last_bag_weight_kg as number | null); }
  if (sets.length === 0) return res.json({ ok: true });
  db.prepare(`UPDATE product_stock SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
  cacheInvalidate('product_stock');
  res.json({ ok: true });
});

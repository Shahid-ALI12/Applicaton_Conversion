import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { AppError } from '../errors.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { parsePage } from '../utils/pagination.js';
import { cacheInvalidate } from '../utils/cache.js';
export const productsRouter = Router();
// LIST
productsRouter.get('/', requireAuth, (req, res) => {
    const { page, pageSize, search } = parsePage(req.query);
    let where = 'deleted_at IS NULL';
    const params = [];
    if (search) {
        where += ' AND (name LIKE ? OR urdu_name LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
    }
    const total = db.prepare(`SELECT COUNT(*) as c FROM products WHERE ${where}`).get(...params).c;
    const offset = (page - 1) * pageSize;
    const rows = db.prepare(`SELECT id, name, urdu_name, default_rate, is_active, deleted_at, created_at FROM products WHERE ${where} ORDER BY name ASC LIMIT ? OFFSET ?`).all(...params, pageSize, offset);
    res.json({ rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
});
// GET by ID
productsRouter.get('/:id', requireAuth, (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    if (!row)
        throw AppError.notFound('Product');
    res.json(row);
});
// CREATE
const createProductSchema = z.object({
    name: z.string().trim().min(1),
    urdu_name: z.string().nullable().optional(),
    default_rate: z.number().nonnegative().default(0),
    is_active: z.boolean().default(true),
});
productsRouter.post('/', requireAuth, validateBody(createProductSchema), (req, res) => {
    const body = req.body;
    const r = db.prepare('INSERT INTO products (name, urdu_name, default_rate, is_active) VALUES (?, ?, ?, ?)').run(body.name, body.urdu_name ?? null, body.default_rate, body.is_active ? 1 : 0);
    cacheInvalidate('products');
    const row = db.prepare('SELECT * FROM products WHERE id = ?').get(Number(r.lastInsertRowid));
    res.status(201).json(row);
});
// UPDATE
const updateProductSchema = z.object({
    name: z.string().trim().min(1).optional(),
    urdu_name: z.string().nullable().optional(),
    default_rate: z.number().nonnegative().optional(),
    is_active: z.boolean().optional(),
});
productsRouter.put('/:id', requireAuth, validateBody(updateProductSchema), (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT id FROM products WHERE id = ?').get(id);
    if (!existing)
        throw AppError.notFound('Product');
    const parsed = req.body;
    const cols = [];
    const vals = [];
    for (const [key, value] of Object.entries(parsed)) {
        if (value !== undefined) {
            cols.push(key);
            if (key === 'is_active')
                vals.push(value ? 1 : 0);
            else
                vals.push(value);
        }
    }
    if (cols.length === 0) {
        const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
        res.json(row);
        return;
    }
    const sets = cols.map(c => `${c} = ?`).join(', ');
    db.prepare(`UPDATE products SET ${sets} WHERE id = ?`).run(...vals, id);
    cacheInvalidate('products');
    const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    res.json(row);
});
// DELETE (soft — set deleted_at)
productsRouter.delete('/:id', requireAuth, (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT id FROM products WHERE id = ?').get(id);
    if (!existing)
        throw AppError.notFound('Product');
    db.prepare("UPDATE products SET deleted_at = datetime('now') WHERE id = ?").run(id);
    cacheInvalidate('products');
    res.json({ ok: true, id, deleted: true });
});
// PUT /:id/restore — restore soft-deleted product
productsRouter.put('/:id/restore', requireAuth, (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT id FROM products WHERE id = ?').get(id);
    if (!existing)
        throw AppError.notFound('Product');
    db.prepare('UPDATE products SET deleted_at = NULL WHERE id = ?').run(id);
    cacheInvalidate('products');
    const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    res.json(row);
});
// DELETE /:id/permanent — hard delete
productsRouter.delete('/:id/permanent', requireAuth, (req, res) => {
    const id = Number(req.params.id);
    const result = db.prepare('DELETE FROM products WHERE id = ?').run(id);
    if (result.changes === 0)
        throw AppError.notFound('Product');
    cacheInvalidate('products');
    res.json({ ok: true });
});
// POST /:id/stock-init — Initialize stock records for a product at all locations
productsRouter.post('/:id/stock-init', requireAuth, (req, res) => {
    const productId = Number(req.params.id);
    const product = db.prepare('SELECT id FROM products WHERE id = ?').get(productId);
    if (!product)
        throw AppError.notFound('Product');
    const locations = db.prepare('SELECT id FROM locations').all();
    for (const loc of locations) {
        db.prepare(`
      INSERT INTO product_stock (product_id, location_id, stock_quantity, last_bag_weight_kg)
      VALUES (?, ?, 0, NULL)
      ON CONFLICT (product_id, location_id) DO NOTHING
    `).run(productId, loc.id);
    }
    cacheInvalidate('product_stock');
    res.json({ ok: true, message: 'Stock records initialized' });
});
//# sourceMappingURL=products.js.map
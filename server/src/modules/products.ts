import { z } from 'zod';
import { createCrudRouter } from './crudFactory.js';
import { requireAuth } from '../middleware/auth.js';
import { Router } from 'express';
import { getDb } from '../db/connection.js';
import { paramInt } from '../utils/pagination.js';
import { ensureStockRecord } from '../services/stock.js';

const createProductSchema = z.object({
  name: z.string().min(1),
  urdu_name: z.string().nullable().optional(),
  default_rate: z.number().min(0).default(0),
  is_active: z.number().int().min(0).max(1).default(1),
});

const updateProductSchema = z.object({
  name: z.string().min(1).optional(),
  urdu_name: z.string().nullable().optional(),
  default_rate: z.number().min(0).optional(),
  is_active: z.number().int().min(0).max(1).optional(),
});

const router = createCrudRouter({
  table: 'products',
  listFields: 'id, name, urdu_name, default_rate, is_active, deleted_at, created_at',
  searchFields: ['name', 'urdu_name'],
  createSchema: createProductSchema,
  updateSchema: updateProductSchema,
  orderBy: 'name ASC',
  softDelete: true,
  extraRoutes: (router: Router) => {
    // POST /:id/stock-init - Initialize stock records for a product at all locations
    router.post('/:id/stock-init', requireAuth, (req, res, next) => {
      try {
        const db = getDb();
        const productId = paramInt(req, 'id');
        const product = db.prepare('SELECT id FROM products WHERE id = ?').get(productId);
        if (!product) {
          next(new Error('Product not found'));
          return;
        }

        const locations = db.prepare('SELECT id FROM locations').all() as any[];
        for (const loc of locations) {
          ensureStockRecord(productId, loc.id);
        }

        res.json({ data: { message: 'Stock records initialized' } });
      } catch (err) {
        next(err);
      }
    });
  },
});

export const productsRouter = router;

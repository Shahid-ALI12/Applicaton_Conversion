import { z } from 'zod';
import { Router, Request, Response, NextFunction } from 'express';
import { getDb, round2 } from '../db/connection.js';
import { AppError } from '../errors.js';
import { createCrudRouter } from './crudFactory.js';
import { requireAuth } from '../middleware/auth.js';
import { parsePagination, offset, paginatedResponse, paramInt } from '../utils/pagination.js';
import { getCustomerBalanceDetail } from '../services/balances.js';

const createCustomerSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['credit', 'cash']).default('credit'),
  phone: z.string().nullable().optional(),
  is_active: z.number().int().min(0).max(1).default(1),
  opening_balance: z.number().min(0).default(0),
  advance_payment: z.number().min(0).default(0),
});

const updateCustomerSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(['credit', 'cash']).optional(),
  phone: z.string().nullable().optional(),
  is_active: z.number().int().min(0).max(1).optional(),
  opening_balance: z.number().min(0).optional(),
  advance_payment: z.number().min(0).optional(),
});

const baseRouter = createCrudRouter({
  table: 'customers',
  listFields: 'id, name, type, phone, is_active, opening_balance, advance_payment, deleted_at, created_at',
  searchFields: ['name', 'phone'],
  createSchema: createCustomerSchema,
  updateSchema: updateCustomerSchema,
  orderBy: 'name ASC',
  softDelete: true,
});

const router = Router();

// LIST with balance
router.get('/', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { page, pageSize, search } = parsePagination(req);
    const o = offset(page, pageSize);

    let whereClause = 'WHERE deleted_at IS NULL';
    const params: any[] = [];

    if (search) {
      whereClause += ' AND (name LIKE ? OR phone LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    const total = (db.prepare(`SELECT COUNT(*) as total FROM customers ${whereClause}`).get(...params) as any).total;
    const data = db.prepare(
      `SELECT id, name, type, phone, is_active, opening_balance, advance_payment, deleted_at, created_at FROM customers ${whereClause} ORDER BY name ASC LIMIT ? OFFSET ?`
    ).all(...params, pageSize, o) as any[];

    const enriched = data.map((c) => {
      const balance = getCustomerBalanceDetail(c.id);
      return {
        ...c,
        opening_balance: round2(c.opening_balance),
        advance_payment: round2(c.advance_payment),
        net_balance: balance?.netBalance ?? 0,
      };
    });

    paginatedResponse(res, enriched, total, page, pageSize);
  } catch (err) {
    next(err);
  }
});

// GET by ID with balance
router.get('/:id', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const id = paramInt(req, 'id');
    const customer = db.prepare(
      'SELECT id, name, type, phone, is_active, opening_balance, advance_payment, deleted_at, created_at FROM customers WHERE id = ?'
    ).get(id) as any;

    if (!customer) {
      next(AppError.notFound('Customer'));
      return;
    }

    const balance = getCustomerBalanceDetail(id);
    res.json({
      data: {
        ...customer,
        opening_balance: round2(customer.opening_balance),
        advance_payment: round2(customer.advance_payment),
        net_balance: balance?.netBalance ?? 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

// CREATE
router.post('/', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const parsed = createCustomerSchema.parse(req.body);
    const info = db.prepare(
      'INSERT INTO customers (name, type, phone, is_active, opening_balance, advance_payment) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      parsed.name,
      parsed.type,
      parsed.phone ?? null,
      parsed.is_active,
      round2(parsed.opening_balance),
      round2(parsed.advance_payment)
    );
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ data: customer });
  } catch (err) {
    next(err);
  }
});

// UPDATE
router.put('/:id', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const id = paramInt(req, 'id');
    const existing = db.prepare('SELECT id FROM customers WHERE id = ?').get(id);
    if (!existing) {
      next(AppError.notFound('Customer'));
      return;
    }

    const parsed = updateCustomerSchema.parse(req.body);
    const fields: string[] = [];
    const values: any[] = [];

    for (const [key, value] of Object.entries(parsed)) {
      if (value !== undefined) {
        fields.push(key);
        values.push(key === 'opening_balance' || key === 'advance_payment' ? round2(value as number) : value);
      }
    }

    if (fields.length === 0) {
      const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
      res.json({ data: customer });
      return;
    }

    const setClause = fields.map((f) => `${f} = ?`).join(', ');
    db.prepare(`UPDATE customers SET ${setClause} WHERE id = ?`).run(...values, id);

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    res.json({ data: customer });
  } catch (err) {
    next(err);
  }
});

// DELETE (soft)
router.delete('/:id', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const id = paramInt(req, 'id');
    const existing = db.prepare('SELECT id FROM customers WHERE id = ?').get(id);
    if (!existing) {
      next(AppError.notFound('Customer'));
      return;
    }
    db.prepare("UPDATE customers SET deleted_at = datetime('now') WHERE id = ?").run(id);
    res.json({ data: { id, deleted: true } });
  } catch (err) {
    next(err);
  }
});

export const customersRouter = router;

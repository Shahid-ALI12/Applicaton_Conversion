import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { AppError } from '../errors.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { parsePage, type PageResult } from '../utils/pagination.js';
import { cacheInvalidate } from '../utils/cache.js';

type Binding = string | number | bigint | Buffer | null;

interface CrudConfig {
  table: string;
  listFields?: string;
  searchFields?: string[];
  createSchema: z.ZodType;
  updateSchema: z.ZodType;
  orderBy?: string;
  extraWhere?: string;
  afterCreate?: (id: number, body: Record<string, unknown>) => void;
  afterUpdate?: (id: number, body: Record<string, unknown>) => void;
  beforeDelete?: (id: number) => void;
}

export function createCrudRouter(config: CrudConfig): Router {
  const router = Router();
  const { table, createSchema, updateSchema } = config;
  const fields = config.listFields ?? '*';
  const searchFields = config.searchFields ?? ['name'];
  const orderBy = config.orderBy ?? 'id DESC';
  const extraWhere = config.extraWhere ?? '';

  router.get('/', requireAuth, (req, res) => {
    const { page, pageSize, search } = parsePage(req.query as Record<string, unknown>);
    let where = '1=1';
    const params: (string | number)[] = [];
    if (search) {
      const conditions = searchFields.map(f => `${f} LIKE ?`);
      where += ` AND (${conditions.join(' OR ')})`;
      for (const _ of searchFields) params.push(`%${search}%`);
    }
    if (extraWhere) where += ` AND ${extraWhere}`;

    const total = (db.prepare(`SELECT COUNT(*) as c FROM ${table} WHERE ${where}`).get(...params as Binding[]) as { c: number }).c;
    const offset = (page - 1) * pageSize;
    const allParams: Binding[] = [...params as Binding[], pageSize, offset];
    const rows = db.prepare(`SELECT ${fields} FROM ${table} WHERE ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`).all(...allParams);
    const result = { rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
    res.json(result);
  });

  router.get('/:id', requireAuth, (req, res) => {
    const row = db.prepare(`SELECT ${fields} FROM ${table} WHERE id = ?`).get(Number(req.params.id));
    if (!row) throw AppError.notFound();
    res.json(row);
  });

  router.post('/', requireAuth, validateBody(createSchema), (req, res) => {
    const cols = Object.keys(req.body as Record<string, unknown>);
    const vals = Object.values(req.body as Record<string, unknown>);
    const placeholders = cols.map(() => '?').join(', ');
    const result = db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`).run(...vals);
    if (config.afterCreate) config.afterCreate(Number(result.lastInsertRowid), req.body as Record<string, unknown>);
    cacheInvalidate(table);
    const row = db.prepare(`SELECT ${fields} FROM ${table} WHERE id = ?`).get(Number(result.lastInsertRowid));
    res.status(201).json(row);
  });

  router.put('/:id', requireAuth, validateBody(updateSchema), (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(id);
    if (!existing) throw AppError.notFound();
    const cols = Object.keys(req.body as Record<string, unknown>);
    const vals = Object.values(req.body as Record<string, unknown>);
    const sets = cols.map(c => `${c} = ?`).join(', ');
    db.prepare(`UPDATE ${table} SET ${sets} WHERE id = ?`).run(...vals, id);
    if (config.afterUpdate) config.afterUpdate(id, req.body as Record<string, unknown>);
    cacheInvalidate(table);
    const row = db.prepare(`SELECT ${fields} FROM ${table} WHERE id = ?`).get(id);
    res.json(row);
  });

  router.delete('/:id', requireAuth, (req, res) => {
    const id = Number(req.params.id);
    if (config.beforeDelete) config.beforeDelete(id);
    const result = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
    if (result.changes === 0) throw AppError.notFound();
    cacheInvalidate(table);
    res.json({ ok: true });
  });

  return router;
}

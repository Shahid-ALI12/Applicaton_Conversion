import { z } from 'zod';
import { createCrudRouter } from './crudFactory.js';

const createSupplierSchema = z.object({
  name: z.string().min(1),
  is_active: z.number().int().min(0).max(1).default(1),
});

const updateSupplierSchema = z.object({
  name: z.string().min(1).optional(),
  is_active: z.number().int().min(0).max(1).optional(),
});

export const suppliersRouter = createCrudRouter({
  table: 'suppliers',
  listFields: 'id, name, is_active, created_at',
  searchFields: ['name'],
  createSchema: createSupplierSchema,
  updateSchema: updateSupplierSchema,
  orderBy: 'name ASC',
});

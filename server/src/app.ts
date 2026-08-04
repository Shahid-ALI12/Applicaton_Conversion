import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { licenseGate } from './middleware/licenseGate.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { errorHandler } from './middleware/error.js';
import { authRouter } from './modules/auth.js';
import { usersRouter } from './modules/users.js';
import { licenseRouter } from './modules/license.js';
import { salesRouter } from './modules/sales.js';
import { purchasesRouter } from './modules/purchases.js';
import { expensesRouter } from './modules/expenses.js';
import { cashRouter } from './modules/cash.js';
import { mixOrdersRouter } from './modules/mixOrders.js';
import { laboursRouter } from './modules/labours.js';
import { customerPaymentsRouter } from './modules/customerPayments.js';
import { reportsRouter } from './modules/reports.js';
import { settingsRouter } from './modules/settings.js';
import { backupsRouter } from './modules/backups.js';
import { createCrudRouter } from './modules/crudFactory.js';
import { z } from 'zod';
import { getStockBalance } from './services/stock.js';
import { requireAuth } from './middleware/auth.js';
import expressStatic from 'serve-static';
import path from 'node:path';

export function createApp() {
  const app = express();

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '2mb' }));

  // Health check
  app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

  // License gate (blocks business APIs when expired)
  app.use('/api', licenseGate);

  // Rate limiting
  app.use('/api', apiLimiter);

  // Auth
  app.use('/api/auth', authRouter);

  // License
  app.use('/api/license', licenseRouter);

  // Users
  app.use('/api/users', usersRouter);

  // Products (CRUD factory)
  app.use('/api/products', createCrudRouter({
    table: 'products',
    listFields: 'id, name, urdu_name, default_rate, is_active, deleted_at, created_at',
    searchFields: ['name'],
    createSchema: z.object({ name: z.string().trim().min(1), urdu_name: z.string().nullable().optional(), default_rate: z.number().nonnegative().default(0), is_active: z.boolean().default(true) }),
    updateSchema: z.object({ name: z.string().trim().min(1).optional(), urdu_name: z.string().nullable().optional(), default_rate: z.number().nonnegative().optional(), is_active: z.boolean().optional(), deleted_at: z.string().nullable().optional() }),
    extraWhere: 'deleted_at IS NULL',
    orderBy: 'name ASC',
  }));

  // Customers (CRUD factory)
  app.use('/api/customers', createCrudRouter({
    table: 'customers',
    listFields: 'id, name, type, phone, is_active, opening_balance, advance_payment, deleted_at, created_at',
    searchFields: ['name', 'phone'],
    createSchema: z.object({ name: z.string().trim().min(1), type: z.enum(['credit', 'cash']).default('credit'), phone: z.string().nullable().optional(), opening_balance: z.number().default(0), advance_payment: z.number().default(0), is_active: z.boolean().default(true) }),
    updateSchema: z.object({ name: z.string().trim().min(1).optional(), type: z.enum(['credit', 'cash']).optional(), phone: z.string().nullable().optional(), opening_balance: z.number().optional(), advance_payment: z.number().optional(), is_active: z.boolean().optional(), deleted_at: z.string().nullable().optional() }),
    extraWhere: 'deleted_at IS NULL',
    orderBy: 'name ASC',
  }));

  // Suppliers (CRUD factory)
  app.use('/api/suppliers', createCrudRouter({
    table: 'suppliers',
    searchFields: ['name'],
    createSchema: z.object({ name: z.string().trim().min(1), is_active: z.boolean().default(true) }),
    updateSchema: z.object({ name: z.string().trim().min(1).optional(), is_active: z.boolean().optional() }),
    orderBy: 'name ASC',
  }));

  // Locations (CRUD factory)
  app.use('/api/locations', createCrudRouter({
    table: 'locations',
    searchFields: ['name'],
    createSchema: z.object({ name: z.string().trim().min(1) }),
    updateSchema: z.object({ name: z.string().trim().min(1).optional() }),
    orderBy: 'name ASC',
  }));

  // Stock
  app.use('/api/stock', createCrudRouter({
    table: 'product_stock',
    listFields: 'ps.id, ps.product_id, p.name as product_name, ps.location_id, l.name as location_name, ps.stock_quantity, ps.last_bag_weight_kg',
    searchFields: ['p.name'],
    createSchema: z.object({ product_id: z.number().int().positive(), location_id: z.number().int().positive(), stock_quantity: z.number().default(0) }),
    updateSchema: z.object({ stock_quantity: z.number().optional(), last_bag_weight_kg: z.number().nullable().optional() }),
    orderBy: 'p.name ASC',
  }));

  // Business modules
  app.use('/api/sales', salesRouter);
  app.use('/api/purchases', purchasesRouter);
  app.use('/api/expenses', expensesRouter);
  app.use('/api/cash', cashRouter);
  app.use('/api/mix-orders', mixOrdersRouter);
  app.use('/api/labours', laboursRouter);
  app.use('/api/customer-payments', customerPaymentsRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/backups', backupsRouter);

  // Serve static client in production
  if (config.isProd) {
    app.use(expressStatic(config.clientDist));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(config.clientDist, 'index.html'));
    });
  }

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}

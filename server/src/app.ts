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
import { stockRouter } from './modules/stock.js';
import { customersRouter } from './modules/customers.js';
import { productsRouter } from './modules/products.js';
import { z } from 'zod';
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

  // Products (custom router with soft-delete)
  app.use('/api/products', productsRouter);

  // Customers (custom router with soft-delete)
  app.use('/api/customers', customersRouter);

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

  // Stock (custom router with JOINs — CRUD factory can't handle table aliases)
  app.use('/api/stock', stockRouter);

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
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(config.clientDist, 'index.html'));
    });
  }

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}

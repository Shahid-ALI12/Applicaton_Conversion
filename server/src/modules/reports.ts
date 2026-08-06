import { Router } from 'express';
import { db } from '../db/connection.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getStockBalance } from '../services/stock.js';
import { getCustomerBalance } from '../services/balances.js';
import { cacheGet, cacheSet } from '../utils/cache.js';

/**
 * Return today's date in PKT (Asia/Karachi, UTC+5) as YYYY-MM-DD.
 *
 * IMPORTANT: The frontend (daily-entry, dashboard, etc.) saves every sale,
 * expense, customer payment with sale_date/expense_date = pktToday() — i.e.
 * the Pakistan local date. The dashboard metrics MUST query with the same
 * PKT date, otherwise at any time between 19:00 UTC and 24:00 UTC (i.e.
 * midnight to 05:00 PKT next day) the metrics card and the records list
 * will be on different days:
 *   - metrics used `new Date().toISOString()` (UTC date)
 *   - records list used `pktToday()` (PKT date)
 * and the numbers shown at the top of the dashboard won't match the rows
 * shown in the details panel below.
 */
function pktToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
}

export const reportsRouter = Router();

reportsRouter.get('/dashboard', requireAuth, (_req, res) => {
  const cached = cacheGet('dashboard');
  if (cached) return res.json(cached);

  const today = pktToday();

  // Metrics the frontend Dashboard expects
  const salesTodayCount = (db.prepare('SELECT COUNT(*) as c FROM sales WHERE sale_date = ?').get(today) as { c: number }).c;
  const billedToday = (db.prepare('SELECT COALESCE(SUM(quantity * rate_per_bag), 0) as t FROM sales WHERE sale_date = ?').get(today) as { t: number }).t;
  const cashCollectedToday = (db.prepare('SELECT COALESCE(SUM(cash_received), 0) as t FROM sales WHERE sale_date = ?').get(today) as { t: number }).t;
  const expensesToday = (db.prepare('SELECT COALESCE(SUM(amount), 0) as t FROM expenses WHERE expense_date = ?').get(today) as { t: number }).t;
  const totalCustomers = (db.prepare('SELECT COUNT(*) as c FROM customers WHERE deleted_at IS NULL').get() as { c: number }).c;

  // Total outstanding = sum of all credit customers' balance due
  const totalOutstanding = (db.prepare(`
    SELECT COALESCE(SUM(
      COALESCE(c.opening_balance, 0)
      + COALESCE((SELECT SUM(s.quantity * s.rate_per_bag) FROM sales s WHERE s.customer_id = c.id), 0)
      - COALESCE((SELECT SUM(s.cash_received) FROM sales s WHERE s.customer_id = c.id), 0)
      - COALESCE((SELECT SUM(cp.amount) FROM customer_payments cp WHERE cp.customer_id = c.id), 0)
      - COALESCE(c.advance_payment, 0)
    ), 0) as t
    FROM customers c WHERE c.deleted_at IS NULL AND c.type = 'credit'
  `).get() as { t: number }).t;

  const overCreditLimitCount = 0; // placeholder — can be enhanced later

  const result = {
    salesTodayCount,
    billedToday: Math.round(billedToday * 100) / 100,
    cashCollectedToday: Math.round(cashCollectedToday * 100) / 100,
    expensesToday: Math.round(expensesToday * 100) / 100,
    totalCustomers,
    totalOutstanding: Math.round(totalOutstanding * 100) / 100,
    overCreditLimitCount,
  };

  cacheSet('dashboard', result, 30_000, ['sales', 'purchases', 'expenses', 'cash_ledger', 'customers', 'customer_payments']);
  res.json(result);
});

reportsRouter.get('/stock', requireAuth, (req, res) => {
  const productId = req.query.productId ? Number(req.query.productId) : undefined;
  const locationId = req.query.locationId ? Number(req.query.locationId) : undefined;
  res.json(getStockBalance(productId, locationId));
});

reportsRouter.get('/customer-balance/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  res.json(getCustomerBalance(id));
});

/**
 * GET /api/reports/customer-balance  (no id)
 *
 * Returns a map of `{ [customerId]: BalanceRow }` for ALL active customers
 * (deleted_at IS NULL). Used by manage-customers.tsx, edit-customer.tsx, and
 * customer-khata.tsx via the `useCustomerBalance()` hook (no customerId arg).
 *
 * Response shape mirrors what those pages already expect:
 *   {
 *     "1": { opening_balance, total_bill, total_cash_paid,
 *            total_goods_value, advance_payment, balance_due },
 *     "2": { ... },
 *     ...
 *   }
 */
reportsRouter.get('/customer-balance', requireAuth, (_req, res) => {
  const ids = db.prepare(
    'SELECT id FROM customers WHERE deleted_at IS NULL ORDER BY id ASC'
  ).all() as { id: number }[];

  const map: Record<number, ReturnType<typeof getCustomerBalance>> = {};
  for (const { id } of ids) {
    try {
      map[id] = getCustomerBalance(id);
    } catch {
      // Skip customers whose balance can't be computed (shouldn't happen
      // since we filter to non-deleted rows, but be defensive).
    }
  }
  res.json(map);
});

/**
 * Dashboard detail panel — returns paginated rows for a specific card type.
 * Frontend calls: /api/reports/dashboard/details?type=sales-today&date=2024-01-01&page=1&pageSize=10
 */
reportsRouter.get('/dashboard/details', requireAuth, (req, res) => {
  const type = req.query.type as string;
  // Default to PKT date when no date is provided by the client. The frontend
  // ALWAYS sends ?date=pktToday() so this is just a safety net, but it MUST
  // be the PKT date — not the UTC date — to stay consistent with how records
  // are stored (sale_date/expense_date are PKT dates).
  const date = (req.query.date as string) ?? pktToday();
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 10));
  const offset = (page - 1) * pageSize;
  const search = (req.query.customer_name as string) ?? (req.query.description as string) ?? '';

  let rows: any[] = [];
  let total = 0;

  switch (type) {
    case 'sales-today': {
      const where = search
        ? `s.sale_date = ? AND c.name LIKE ?`
        : `s.sale_date = ?`;
      const params = search ? [date, `%${search}%`] : [date];
      total = ((db.prepare(`SELECT COUNT(*) as c FROM sales s JOIN customers c ON c.id = s.customer_id WHERE ${where}`).get(...params) as { c: number }).c);
      rows = db.prepare(`
        SELECT c.name as customer, p.name as product, s.quantity as qty, s.unit_type as unit,
               s.rate_per_bag as rate, s.rickshaw_fare as fare, s.quantity * s.rate_per_bag as amount
        FROM sales s
        JOIN customers c ON c.id = s.customer_id
        JOIN products p ON p.id = s.product_id
        WHERE ${where}
        ORDER BY s.id DESC LIMIT ? OFFSET ?
      `).all(...params, pageSize, offset);
      break;
    }
    case 'billed-today': {
      const where = search
        ? `s.sale_date = ? AND c.name LIKE ?`
        : `s.sale_date = ?`;
      const params = search ? [date, `%${search}%`] : [date];
      total = ((db.prepare(`SELECT COUNT(*) as c FROM sales s JOIN customers c ON c.id = s.customer_id WHERE ${where}`).get(...params) as { c: number }).c);
      rows = db.prepare(`
        SELECT c.name as customer, p.name as product, s.quantity as qty, s.unit_type as unit,
               s.quantity * s.rate_per_bag as bill, s.cash_received as cash_paid,
               (s.quantity * s.rate_per_bag - s.cash_received) as balance
        FROM sales s
        JOIN customers c ON c.id = s.customer_id
        JOIN products p ON p.id = s.product_id
        WHERE ${where}
        ORDER BY s.id DESC LIMIT ? OFFSET ?
      `).all(...params, pageSize, offset);
      break;
    }
    case 'cash-collected': {
      const where = search
        ? `s.sale_date = ? AND c.name LIKE ?`
        : `s.sale_date = ?`;
      const params = search ? [date, `%${search}%`] : [date];
      total = ((db.prepare(`SELECT COUNT(*) as c FROM sales s JOIN customers c ON c.id = s.customer_id WHERE ${where} AND s.cash_received > 0`).get(...params) as { c: number }).c);
      rows = db.prepare(`
        SELECT c.name as customer, p.name as product, s.cash_received as cash
        FROM sales s
        JOIN customers c ON c.id = s.customer_id
        JOIN products p ON p.id = s.product_id
        WHERE ${where} AND s.cash_received > 0
        ORDER BY s.id DESC LIMIT ? OFFSET ?
      `).all(...params, pageSize, offset);
      break;
    }
    case 'expenses-today': {
      const where = search
        ? `e.expense_date = ? AND e.description LIKE ?`
        : `e.expense_date = ?`;
      const params = search ? [date, `%${search}%`] : [date];
      total = ((db.prepare(`SELECT COUNT(*) as c FROM expenses e WHERE ${where}`).get(...params) as { c: number }).c);
      rows = db.prepare(`
        SELECT e.description, e.amount
        FROM expenses e
        WHERE ${where}
        ORDER BY e.id DESC LIMIT ? OFFSET ?
      `).all(...params, pageSize, offset);
      break;
    }
    case 'customers': {
      const where = search
        ? `c.deleted_at IS NULL AND c.name LIKE ?`
        : `c.deleted_at IS NULL`;
      const params = search ? [`%${search}%`] : [];
      total = ((db.prepare(`SELECT COUNT(*) as c FROM customers c WHERE ${where}`).get(...params) as { c: number }).c);
      rows = db.prepare(`
        SELECT c.name, c.type, c.phone, c.is_active as active, c.opening_balance as credit_limit, c.created_at as since
        FROM customers c
        WHERE ${where}
        ORDER BY c.name ASC LIMIT ? OFFSET ?
      `).all(...params, pageSize, offset);
      break;
    }
    case 'outstanding': {
      const where = search
        ? `c.deleted_at IS NULL AND c.type = 'credit' AND c.name LIKE ?`
        : `c.deleted_at IS NULL AND c.type = 'credit'`;
      const params = search ? [`%${search}%`] : [];
      total = ((db.prepare(`SELECT COUNT(*) as c FROM customers c WHERE ${where}`).get(...params) as { c: number }).c);
      rows = db.prepare(`
        SELECT c.name as customer, c.phone, c.type,
               COALESCE(c.opening_balance,0) + COALESCE((SELECT SUM(s.quantity*s.rate_per_bag) FROM sales s WHERE s.customer_id=c.id),0) as total_bill,
               COALESCE((SELECT SUM(s.cash_received) FROM sales s WHERE s.customer_id=c.id),0) + COALESCE(c.advance_payment,0) as paid,
               COALESCE(c.opening_balance,0) + COALESCE((SELECT SUM(s.quantity*s.rate_per_bag) FROM sales s WHERE s.customer_id=c.id),0) - COALESCE((SELECT SUM(s.cash_received) FROM sales s WHERE s.customer_id=c.id),0) - COALESCE(c.advance_payment,0) as balance
        FROM customers c
        WHERE ${where}
        ORDER BY balance DESC LIMIT ? OFFSET ?
      `).all(...params, pageSize, offset);
      break;
    }
    case 'over-credit': {
      rows = [];
      total = 0;
      break;
    }
    default:
      rows = [];
      total = 0;
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  res.json({ rows, total, page, pageSize, totalPages, label: type });
});

reportsRouter.get('/reconciliation', requireAuth, (req, res) => {
  // Frontend (Day Reconciliation page) expects an object with these snake_case keys:
  //   total_bags_sold, total_billed, cash_received, from_credit_customers,
  //   from_cash_customers, total_expenses, total_cash_in, total_cash_out,
  //   expected_cash_in_hand, expenses[]
  // Previously this returned a different shape ({ date, sales_cash, expenses, ... })
  // so every MetricCard on the page showed 0.
  const from = (req.query.from as string) ?? pktToday();
  const to = (req.query.to as string) ?? from;

  const sales = db.prepare(`
    SELECT s.id, s.sale_date, s.quantity, s.unit_type, s.rate_per_bag, s.rickshaw_fare, s.cash_received,
           c.name as customer_name, c.type as customer_type, p.name as product_name
    FROM sales s
    LEFT JOIN customers c ON c.id = s.customer_id
    LEFT JOIN products p ON p.id = s.product_id
    WHERE s.sale_date >= ? AND s.sale_date <= ?
    ORDER BY s.id DESC
  `).all(from, to) as Array<{
    id: number; sale_date: string; quantity: number; unit_type: string;
    rate_per_bag: number; rickshaw_fare: number; cash_received: number;
    customer_name: string | null; customer_type: 'credit' | 'cash' | null; product_name: string | null;
  }>;

  const expenses = db.prepare(`
    SELECT id, expense_date, description, amount
    FROM expenses
    WHERE expense_date >= ? AND expense_date <= ?
    ORDER BY id DESC
  `).all(from, to) as Array<{ id: number; expense_date: string; description: string; amount: number }>;

  const total_bags_sold = sales
    .filter((s) => s.unit_type === 'bags')
    .reduce((sum, s) => sum + (s.quantity || 0), 0);

  const total_billed = sales.reduce(
    (sum, s) => sum + (s.quantity || 0) * (s.rate_per_bag || 0) + (s.rickshaw_fare || 0),
    0
  );
  const cash_received = sales.reduce((sum, s) => sum + (s.cash_received || 0), 0);
  const total_expenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

  const from_credit_customers = sales
    .filter((s) => s.customer_type === 'credit')
    .reduce((sum, s) => sum + (s.quantity || 0) * (s.rate_per_bag || 0) + (s.rickshaw_fare || 0), 0);
  const from_cash_customers = total_billed - from_credit_customers;

  res.json({
    total_bags_sold: Math.round(total_bags_sold * 100) / 100,
    total_billed: Math.round(total_billed * 100) / 100,
    cash_received: Math.round(cash_received * 100) / 100,
    from_credit_customers: Math.round(from_credit_customers * 100) / 100,
    from_cash_customers: Math.round(from_cash_customers * 100) / 100,
    total_expenses: Math.round(total_expenses * 100) / 100,
    total_cash_in: Math.round(cash_received * 100) / 100,
    total_cash_out: Math.round(total_expenses * 100) / 100,
    expected_cash_in_hand: Math.round((cash_received - total_expenses) * 100) / 100,
    expenses,
  });
});

// GET /api/reports/reconciliation/details?type=...&from=&to=&page=&pageSize=
//                                            &customer_name=&description=
// Returns paginated detail rows for a reconciliation card.
//   { rows, total, page, pageSize, totalPages, label }
reportsRouter.get('/reconciliation/details', requireAuth, (req, res) => {
  const type = (req.query.type as string) || '';
  const from = (req.query.from as string) || pktToday();
  const to = (req.query.to as string) || from;
  const page = Math.max(1, parseInt((req.query.page as string) || '1', 10) || 1);
  const pageSize = Math.max(1, parseInt((req.query.pageSize as string) || '50', 10) || 50);
  const customerName = (req.query.customer_name as string | undefined)?.trim() || '';
  const descriptionSearch = (req.query.description as string | undefined)?.trim() || '';

  // Resolve customer IDs by name substring (case-insensitive)
  let custIds: number[] | null = null;
  if (customerName) {
    const matched = db.prepare(`SELECT id FROM customers WHERE LOWER(name) LIKE ?`).all(`%${customerName.toLowerCase()}%`) as Array<{ id: number }>;
    custIds = matched.map((r) => r.id);
  }

  function paginate<T>(all: T[]): { rows: T[]; total: number; page: number; pageSize: number; totalPages: number } {
    const total = all.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const start = (page - 1) * pageSize;
    return { rows: all.slice(start, start + pageSize), total, page, pageSize, totalPages };
  }

  try {
    switch (type) {
      case 'bags-sold': {
        if (customerName && custIds && custIds.length === 0) return res.json({ rows: [], total: 0, page, pageSize, totalPages: 1, label: 'Total Bags Sold' });
        let sql = `SELECT s.id, s.sale_date, s.quantity, s.unit_type, s.rate_per_bag, c.name as customer_name, p.name as product_name
                   FROM sales s LEFT JOIN customers c ON c.id=s.customer_id LEFT JOIN products p ON p.id=s.product_id
                   WHERE s.sale_date >= ? AND s.sale_date <= ?`;
        const params: any[] = [from, to];
        if (custIds) { sql += ` AND s.customer_id IN (${custIds.map(() => '?').join(',')})`; params.push(...custIds); }
        sql += ` ORDER BY s.id DESC`;
        const rows = (db.prepare(sql).all(...params) as any[]).map((s) => ({
          id: s.id, date: s.sale_date, customer: s.customer_name || 'N/A', product: s.product_name || 'N/A',
          qty: s.quantity, unit: s.unit_type || 'bags', rate: s.rate_per_bag,
        }));
        return res.json({ ...paginate(rows), label: 'Total Bags Sold' });
      }

      case 'total-billed': {
        if (customerName && custIds && custIds.length === 0) return res.json({ rows: [], total: 0, page, pageSize, totalPages: 1, label: 'Total Billed' });
        let sql = `SELECT s.id, s.sale_date, s.quantity, s.rate_per_bag, s.rickshaw_fare, s.cash_received, c.name as customer_name, p.name as product_name, s.unit_type
                   FROM sales s LEFT JOIN customers c ON c.id=s.customer_id LEFT JOIN products p ON p.id=s.product_id
                   WHERE s.sale_date >= ? AND s.sale_date <= ?`;
        const params: any[] = [from, to];
        if (custIds) { sql += ` AND s.customer_id IN (${custIds.map(() => '?').join(',')})`; params.push(...custIds); }
        sql += ` ORDER BY s.id DESC`;
        const rows = (db.prepare(sql).all(...params) as any[]).map((s) => {
          const bill = (s.quantity || 0) * (s.rate_per_bag || 0) + (s.rickshaw_fare || 0);
          return {
            id: s.id, date: s.sale_date, customer: s.customer_name || 'N/A', product: s.product_name || 'N/A',
            qty: s.quantity, unit: s.unit_type || 'bags', bill,
            cash_paid: s.cash_received || 0, balance: bill - (s.cash_received || 0),
          };
        });
        return res.json({ ...paginate(rows), label: 'Total Billed' });
      }

      case 'cash-received': {
        if (customerName && custIds && custIds.length === 0) return res.json({ rows: [], total: 0, page, pageSize, totalPages: 1, label: 'Cash Actually Received' });
        let sql = `SELECT s.id, s.sale_date, s.quantity, s.rate_per_bag, s.rickshaw_fare, s.cash_received, c.name as customer_name, p.name as product_name
                   FROM sales s LEFT JOIN customers c ON c.id=s.customer_id LEFT JOIN products p ON p.id=s.product_id
                   WHERE s.sale_date >= ? AND s.sale_date <= ? AND s.cash_received > 0`;
        const params: any[] = [from, to];
        if (custIds) { sql += ` AND s.customer_id IN (${custIds.map(() => '?').join(',')})`; params.push(...custIds); }
        sql += ` ORDER BY s.id DESC`;
        const rows = (db.prepare(sql).all(...params) as any[]).map((s) => ({
          id: s.id, date: s.sale_date, customer: s.customer_name || 'N/A', product: s.product_name || 'N/A',
          bill: (s.quantity || 0) * (s.rate_per_bag || 0) + (s.rickshaw_fare || 0),
          cash: s.cash_received,
        }));
        return res.json({ ...paginate(rows), label: 'Cash Actually Received' });
      }

      case 'credit-customers': {
        if (customerName && custIds && custIds.length === 0) return res.json({ rows: [], total: 0, page, pageSize, totalPages: 1, label: 'From Credit Customers' });
        let sql = `SELECT s.id, s.sale_date, s.quantity, s.rate_per_bag, s.rickshaw_fare, s.cash_received, c.name as customer_name, c.type as customer_type, p.name as product_name
                   FROM sales s LEFT JOIN customers c ON c.id=s.customer_id LEFT JOIN products p ON p.id=s.product_id
                   WHERE s.sale_date >= ? AND s.sale_date <= ? AND c.type='credit'`;
        const params: any[] = [from, to];
        if (custIds) { sql += ` AND s.customer_id IN (${custIds.map(() => '?').join(',')})`; params.push(...custIds); }
        sql += ` ORDER BY s.id DESC`;
        const rows = (db.prepare(sql).all(...params) as any[]).map((s) => {
          const bill = (s.quantity || 0) * (s.rate_per_bag || 0) + (s.rickshaw_fare || 0);
          return {
            id: s.id, date: s.sale_date, customer: s.customer_name || 'N/A', product: s.product_name || 'N/A',
            bill, cash_paid: s.cash_received || 0, balance: bill - (s.cash_received || 0),
          };
        });
        return res.json({ ...paginate(rows), label: 'From Credit Customers' });
      }

      case 'cash-customers': {
        if (customerName && custIds && custIds.length === 0) return res.json({ rows: [], total: 0, page, pageSize, totalPages: 1, label: 'From Cash Customers' });
        let sql = `SELECT s.id, s.sale_date, s.quantity, s.rate_per_bag, s.rickshaw_fare, s.cash_received, c.name as customer_name, c.type as customer_type, p.name as product_name
                   FROM sales s LEFT JOIN customers c ON c.id=s.customer_id LEFT JOIN products p ON p.id=s.product_id
                   WHERE s.sale_date >= ? AND s.sale_date <= ? AND c.type='cash'`;
        const params: any[] = [from, to];
        if (custIds) { sql += ` AND s.customer_id IN (${custIds.map(() => '?').join(',')})`; params.push(...custIds); }
        sql += ` ORDER BY s.id DESC`;
        const rows = (db.prepare(sql).all(...params) as any[]).map((s) => {
          const bill = (s.quantity || 0) * (s.rate_per_bag || 0) + (s.rickshaw_fare || 0);
          return {
            id: s.id, date: s.sale_date, customer: s.customer_name || 'N/A', product: s.product_name || 'N/A',
            bill, cash_paid: s.cash_received || 0,
          };
        });
        return res.json({ ...paginate(rows), label: 'From Cash Customers' });
      }

      case 'expenses': {
        let sql = `SELECT id, expense_date, description, amount FROM expenses WHERE expense_date >= ? AND expense_date <= ?`;
        const params: any[] = [from, to];
        if (descriptionSearch) {
          sql += ` AND LOWER(description) LIKE ?`;
          params.push(`%${descriptionSearch.toLowerCase()}%`);
        }
        sql += ` ORDER BY id DESC`;
        const rows = (db.prepare(sql).all(...params) as any[]).map((e) => ({
          id: e.id, date: e.expense_date, description: e.description || 'N/A', category: '—', amount: e.amount,
        }));
        return res.json({ ...paginate(rows), label: 'Total Expenses' });
      }

      default:
        return res.status(400).json({ error: { code: 'BAD_INPUT', message: 'Invalid type' } });
    }
  } catch (err: any) {
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to fetch details', detail: err?.message } });
  }
});

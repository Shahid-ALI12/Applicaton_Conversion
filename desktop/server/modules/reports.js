import { Router } from 'express';
import { db } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { getStockBalance } from '../services/stock.js';
import { getCustomerBalance } from '../services/balances.js';
import { cacheGet, cacheSet } from '../utils/cache.js';
export const reportsRouter = Router();
reportsRouter.get('/dashboard', requireAuth, (_req, res) => {
    const cached = cacheGet('dashboard');
    if (cached)
        return res.json(cached);
    const today = new Date().toISOString().slice(0, 10);
    // Metrics the frontend Dashboard expects
    const salesTodayCount = db.prepare('SELECT COUNT(*) as c FROM sales WHERE sale_date = ?').get(today).c;
    const billedToday = db.prepare('SELECT COALESCE(SUM(quantity * rate_per_bag), 0) as t FROM sales WHERE sale_date = ?').get(today).t;
    const cashCollectedToday = db.prepare('SELECT COALESCE(SUM(cash_received), 0) as t FROM sales WHERE sale_date = ?').get(today).t;
    const expensesToday = db.prepare('SELECT COALESCE(SUM(amount), 0) as t FROM expenses WHERE expense_date = ?').get(today).t;
    const totalCustomers = db.prepare('SELECT COUNT(*) as c FROM customers WHERE deleted_at IS NULL').get().c;
    // Total outstanding = sum of all credit customers' balance due
    const totalOutstanding = db.prepare(`
    SELECT COALESCE(SUM(
      COALESCE(c.opening_balance, 0)
      + COALESCE((SELECT SUM(s.quantity * s.rate_per_bag) FROM sales s WHERE s.customer_id = c.id), 0)
      - COALESCE((SELECT SUM(s.cash_received) FROM sales s WHERE s.customer_id = c.id), 0)
      - COALESCE((SELECT SUM(cp.amount) FROM customer_payments cp WHERE cp.customer_id = c.id), 0)
      - COALESCE(c.advance_payment, 0)
    ), 0) as t
    FROM customers c WHERE c.deleted_at IS NULL AND c.type = 'credit'
  `).get().t;
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
    const ids = db.prepare('SELECT id FROM customers WHERE deleted_at IS NULL ORDER BY id ASC').all();
    const map = {};
    for (const { id } of ids) {
        try {
            map[id] = getCustomerBalance(id);
        }
        catch {
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
    const type = req.query.type;
    const date = req.query.date ?? new Date().toISOString().slice(0, 10);
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 10));
    const offset = (page - 1) * pageSize;
    const search = req.query.customer_name ?? req.query.description ?? '';
    let rows = [];
    let total = 0;
    switch (type) {
        case 'sales-today': {
            const where = search
                ? `s.sale_date = ? AND c.name LIKE ?`
                : `s.sale_date = ?`;
            const params = search ? [date, `%${search}%`] : [date];
            total = (db.prepare(`SELECT COUNT(*) as c FROM sales s JOIN customers c ON c.id = s.customer_id WHERE ${where}`).get(...params).c);
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
            total = (db.prepare(`SELECT COUNT(*) as c FROM sales s JOIN customers c ON c.id = s.customer_id WHERE ${where}`).get(...params).c);
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
            total = (db.prepare(`SELECT COUNT(*) as c FROM sales s JOIN customers c ON c.id = s.customer_id WHERE ${where} AND s.cash_received > 0`).get(...params).c);
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
            total = (db.prepare(`SELECT COUNT(*) as c FROM expenses e WHERE ${where}`).get(...params).c);
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
            total = (db.prepare(`SELECT COUNT(*) as c FROM customers c WHERE ${where}`).get(...params).c);
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
            total = (db.prepare(`SELECT COUNT(*) as c FROM customers c WHERE ${where}`).get(...params).c);
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
    const date = req.query.date ?? new Date().toISOString().slice(0, 10);
    const sales = db.prepare('SELECT COALESCE(SUM(cash_received), 0) as t FROM sales WHERE sale_date = ?').get(date).t;
    const expenses = db.prepare('SELECT COALESCE(SUM(amount), 0) as t FROM expenses WHERE expense_date = ?').get(date).t;
    const purchases = db.prepare('SELECT COALESCE(SUM(cash_paid), 0) as t FROM purchases WHERE purchase_date = ?').get(date).t;
    const cashIn = db.prepare("SELECT COALESCE(SUM(cl.amount), 0) as t FROM cash_ledger cl JOIN cash_accounts ca ON ca.id=cl.account_id WHERE cl.direction='in' AND cl.entry_date=? AND ca.name='Cash In Hand'").get(date).t;
    const cashOut = db.prepare("SELECT COALESCE(SUM(cl.amount), 0) as t FROM cash_ledger cl JOIN cash_accounts ca ON ca.id=cl.account_id WHERE cl.direction='out' AND cl.entry_date=? AND ca.name='Cash In Hand'").get(date).t;
    res.json({
        date,
        sales_cash: Math.round(sales * 100) / 100,
        purchase_cash: Math.round(purchases * 100) / 100,
        expenses: Math.round(expenses * 100) / 100,
        cash_in: Math.round(cashIn * 100) / 100,
        cash_out: Math.round(cashOut * 100) / 100,
        expected_cash: Math.round((cashIn - cashOut) * 100) / 100,
    });
});
//# sourceMappingURL=reports.js.map
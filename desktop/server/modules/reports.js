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
    const thisMonth = today.slice(0, 7);
    const totalSales = db.prepare(`SELECT COALESCE(SUM(quantity * rate_per_bag), 0) as t FROM sales WHERE strftime('%Y-%m', sale_date) = ?`).get(thisMonth).t;
    const totalPurchases = db.prepare(`SELECT COALESCE(SUM(quantity * rate_per_bag), 0) as t FROM purchases WHERE strftime('%Y-%m', purchase_date) = ?`).get(thisMonth).t;
    const totalExpenses = db.prepare(`SELECT COALESCE(SUM(amount), 0) as t FROM expenses WHERE strftime('%Y-%m', expense_date) = ?`).get(thisMonth).t;
    const totalCashIn = db.prepare(`SELECT COALESCE(SUM(amount), 0) as t FROM cash_ledger WHERE direction='in' AND strftime('%Y-%m', entry_date) = ?`).get(thisMonth).t;
    const totalCashOut = db.prepare(`SELECT COALESCE(SUM(amount), 0) as t FROM cash_ledger WHERE direction='out' AND strftime('%Y-%m', entry_date) = ?`).get(thisMonth).t;
    const result = {
        totalSales: Math.round(totalSales * 100) / 100,
        totalPurchases: Math.round(totalPurchases * 100) / 100,
        totalExpenses: Math.round(totalExpenses * 100) / 100,
        totalCashIn: Math.round(totalCashIn * 100) / 100,
        totalCashOut: Math.round(totalCashOut * 100) / 100,
        month: thisMonth,
    };
    cacheSet('dashboard', result, 30_000, ['sales', 'purchases', 'expenses', 'cash_ledger']);
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
import { db } from '../db/connection.js';
export function getCustomerBalance(customerId) {
    const cust = db.prepare('SELECT opening_balance, advance_payment FROM customers WHERE id = ?').get(customerId);
    if (!cust)
        throw new Error('Customer nahi mila');
    const sales = db.prepare(`
    SELECT COALESCE(SUM(quantity * rate_per_bag), 0) as total_bill,
           COALESCE(SUM(cash_received), 0) as total_cash
    FROM sales WHERE customer_id = ?
  `).get(customerId);
    const goods = db.prepare(`
    SELECT COALESCE(SUM(p.quantity * p.rate_per_bag), 0) as total
    FROM purchases p WHERE p.settled_by_customer_id = ?
  `).get(customerId);
    const payments = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total FROM customer_payments WHERE customer_id = ?
  `).get(customerId);
    const totalBill = sales.total_bill;
    const totalCashPaid = sales.total_cash + payments.total;
    const totalGoods = goods.total;
    const advance = cust.advance_payment ?? 0;
    const balanceDue = cust.opening_balance + totalBill - totalCashPaid - totalGoods - advance;
    return {
        opening_balance: cust.opening_balance,
        total_bill: totalBill,
        total_cash_paid: totalCashPaid,
        total_goods_value: totalGoods,
        advance_payment: advance,
        balance_due: Math.round(balanceDue * 100) / 100,
    };
}
//# sourceMappingURL=balances.js.map
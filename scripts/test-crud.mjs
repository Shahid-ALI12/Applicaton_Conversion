/**
 * Comprehensive CRUD test for all API endpoints.
 * Usage: node scripts/test-crud.mjs
 */
const BASE = 'http://localhost:8000';
let TOKEN = '';
let passed = 0;
let failed = 0;

async function api(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

function assert(name, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ ${name}${detail ? ' — ' + detail : ''}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n═══ API CRUD Test Suite ═══\n');

  // ── Auth ──
  console.log('── Auth ──');
  {
    const r = await api('POST', '/api/auth/login', { username: 'admin', password: 'admin123' });
    assert('Login', r.ok && r.data.token, `status=${r.status}`);
    TOKEN = r.data.token;
  }
  {
    const r = await api('POST', '/api/auth/login', { username: 'admin', password: 'wrong' });
    assert('Login fail with wrong password', !r.ok, `status=${r.status}`);
  }

  // ── Health ──
  console.log('\n── Health ──');
  {
    const r = await api('GET', '/api/health');
    assert('Health check', r.data.ok === true);
  }

  // ── Products ──
  console.log('\n── Products ──');
  let productId;
  {
    const r = await api('GET', '/api/products');
    assert('List products', r.ok && Array.isArray(r.data.rows), `rows=${r.data.rows?.length}`);
  }
  {
    const r = await api('POST', '/api/products', { name: 'Test Feed', default_rate: 450 });
    productId = r.data?.id;
    assert('Create product', r.ok && productId, `id=${productId} status=${r.status}`);
  }
  {
    const r = await api('PUT', `/api/products/${productId}`, { default_rate: 500 });
    assert('Update product rate', r.ok && r.data.default_rate === 500, `rate=${r.data.default_rate}`);
  }
  {
    const r = await api('GET', `/api/products/${productId}`);
    assert('Get single product', r.ok && r.data.id === productId);
  }
  {
    const r = await api('DELETE', `/api/products/${productId}`);
    assert('Soft-delete product', r.ok && r.data.ok, JSON.stringify(r.data));
  }
  {
    const r = await api('PUT', `/api/products/${productId}/restore`);
    assert('Restore product', r.ok, JSON.stringify(r.data).substring(0, 80));
  }
  {
    const r = await api('DELETE', `/api/products/${productId}/permanent`);
    assert('Permanent-delete product', r.ok);
  }

  // ── Customers ──
  console.log('\n── Customers ──');
  let customerId;
  {
    const r = await api('GET', '/api/customers');
    assert('List customers', r.ok && Array.isArray(r.data.rows), `rows=${r.data.rows?.length}`);
  }
  {
    const r = await api('POST', '/api/customers', { name: 'Ali Khan', type: 'credit', phone: '03001234567', opening_balance: 10000 });
    customerId = r.data?.id;
    assert('Create customer', r.ok && customerId, `id=${customerId} status=${r.status}`);
  }
  {
    const r = await api('PUT', `/api/customers/${customerId}`, { opening_balance: 15000 });
    assert('Update customer OB', r.ok, `OB=${r.data.opening_balance}`);
  }
  {
    const r = await api('DELETE', `/api/customers/${customerId}`);
    assert('Soft-delete customer', r.ok && r.data.ok);
  }
  {
    const r = await api('PUT', `/api/customers/${customerId}/restore`);
    assert('Restore customer', r.ok);
  }

  // ── Suppliers ──
  console.log('\n── Suppliers ──');
  let supplierId;
  {
    const r = await api('POST', '/api/suppliers', { name: 'ABC Traders', is_active: true });
    supplierId = r.data?.id;
    assert('Create supplier', r.ok && supplierId, `id=${supplierId}`);
  }
  {
    const r = await api('GET', '/api/suppliers');
    assert('List suppliers', r.ok && Array.isArray(r.data.rows), `rows=${r.data.rows?.length}`);
  }

  // ── Locations ──
  console.log('\n── Locations ──');
  {
    const r = await api('GET', '/api/locations');
    assert('List locations', r.ok && Array.isArray(r.data.rows), `rows=${r.data.rows?.length}`);
  }

  // ── Stock ──
  console.log('\n── Stock ──');
  {
    const r = await api('GET', '/api/stock');
    assert('List stock', r.ok && Array.isArray(r.data.rows), `rows=${r.data.rows?.length}`);
  }

  // ── Sales ──
  console.log('\n── Sales ──');
  let saleId;
  {
    // Get a product ID for the sale
    const prodList = await api('GET', '/api/products');
    const pId = prodList.data.rows?.[0]?.id;
    const r = await api('POST', '/api/sales', {
      customer_id: customerId,
      location_id: 1,
      sale_date: new Date().toISOString().slice(0, 10),
      items: [{ product_id: pId || 1, quantity: 3, rate_per_bag: 500, unit_type: 'bags' }],
      cash_received: 1500,
    });
    saleId = r.data?.saleIds?.[0];
    assert('Create sale', r.ok && saleId, `groupId=${r.data.groupId} saleId=${saleId}`);
  }
  {
    const r = await api('GET', '/api/sales');
    assert('List sales', r.ok && Array.isArray(r.data.rows), `rows=${r.data.rows?.length}`);
  }
  if (saleId) {
    const r = await api('DELETE', `/api/sales/${saleId}`);
    assert('Delete sale', r.ok && r.data.ok);
  }

  // ── Purchases ──
  console.log('\n── Purchases ──');
  let purchaseId;
  {
    const prodList = await api('GET', '/api/products');
    const pId = prodList.data.rows?.[0]?.id;
    const r = await api('POST', '/api/purchases', {
      purchase_date: new Date().toISOString().slice(0, 10),
      product_id: pId || 1,
      quantity: 10,
      rate_per_bag: 400,
      supplier_id: supplierId,
      cash_paid: 4000,
      location_id: 1,
      unit_type: 'bags',
    });
    purchaseId = r.data?.id;
    assert('Create purchase', r.ok && purchaseId, `id=${purchaseId}`);
  }
  if (purchaseId) {
    const r = await api('DELETE', `/api/purchases/${purchaseId}`);
    assert('Delete purchase', r.ok && r.data.ok);
  }

  // ── Expenses ──
  console.log('\n── Expenses ──');
  let expenseId;
  {
    const r = await api('POST', '/api/expenses', { description: 'Electricity Bill', amount: 2000, expense_date: new Date().toISOString().slice(0, 10) });
    expenseId = r.data?.id;
    assert('Create expense', r.ok && expenseId, `id=${expenseId}`);
  }
  if (expenseId) {
    const r = await api('DELETE', `/api/expenses/${expenseId}`);
    assert('Delete expense', r.ok && r.data.ok);
  }

  // ── Labours ──
  console.log('\n── Labours ──');
  let labourId;
  {
    const r = await api('POST', '/api/labours', { name: 'Raju Helper', role: 'helper', daily_wage: 400, location_id: 1, is_active: true });
    labourId = r.data?.id;
    assert('Create labour', r.ok && labourId, `id=${labourId}`);
  }
  {
    const r = await api('GET', '/api/labours');
    assert('List labours', r.ok && Array.isArray(r.data.rows), `rows=${r.data.rows?.length}`);
  }
  {
    const r = await api('POST', '/api/labours/payments', { labour_id: labourId, amount: 400, payment_type: 'salary', payment_date: new Date().toISOString().slice(0, 10) });
    const payId = r.data?.id;
    assert('Create labour payment', r.ok && payId, `id=${payId}`);
    if (payId) {
      const d = await api('DELETE', `/api/labours/payments/${payId}`);
      assert('Delete labour payment', d.ok && d.data.ok);
    }
  }

  // ── Customer Payments ──
  console.log('\n── Customer Payments ──');
  {
    const r = await api('POST', '/api/customer-payments', { customer_id: customerId, amount: 5000, payment_date: new Date().toISOString().slice(0, 10) });
    const cpId = r.data?.id;
    assert('Create customer payment', r.ok && cpId, `id=${cpId}`);
    if (cpId) {
      const d = await api('DELETE', `/api/customer-payments/${cpId}`);
      assert('Delete customer payment', d.ok && d.data.ok);
    }
  }

  // ── Cash ──
  console.log('\n── Cash ──');
  {
    const r = await api('GET', '/api/cash/accounts');
    assert('List cash accounts', r.ok && Array.isArray(r.data), `accounts=${r.data?.length}`);
  }
  {
    const r = await api('GET', '/api/cash/balances');
    assert('Get cash balances', r.ok);
  }

  // ── Reports ──
  console.log('\n── Reports ──');
  {
    const r = await api('GET', '/api/reports/dashboard');
    assert('Dashboard metrics', r.ok && r.data.salesTodayCount !== undefined, JSON.stringify(r.data));
  }
  {
    const r = await api('GET', '/api/reports/dashboard/details?type=sales-today');
    assert('Dashboard details', r.ok && Array.isArray(r.data.rows), `rows=${r.data.rows?.length}`);
  }
  {
    const r = await api('GET', '/api/reports/reconciliation');
    assert('Reconciliation', r.ok && r.data.date, `date=${r.data.date}`);
  }
  {
    const r = await api('GET', `/api/reports/customer-balance/${customerId}`);
    assert('Customer balance', r.ok, JSON.stringify(r.data).substring(0, 100));
  }

  // ── Settings ──
  console.log('\n── Settings ──');
  {
    const r = await api('GET', '/api/settings');
    assert('Get settings', r.ok);
  }

  // ── Summary ──
  console.log(`\n═══ Results: ${passed} passed, ${failed} failed ═══`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => { console.error('Fatal:', e); process.exit(1); });

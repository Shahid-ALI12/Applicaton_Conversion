/**
 * Verifies the dashboard metrics route and dashboard details route are now
 * using the SAME PKT date when no date is provided by the client.
 *
 * Earlier bug: metrics used `new Date().toISOString().slice(0, 10)` (UTC)
 * while details used `pktToday()` (PKT). Between 19:00–24:00 UTC the two
 * would be on different calendar days, causing the metric cards at the top
 * of the dashboard to disagree with the records list at the bottom.
 *
 * Usage: node scripts/test-dashboard-date.mjs
 */
import { createApp } from '../server/dist/app.js';
import { runMigrations } from '../server/dist/db/migrate.js';
import { runSeed } from '../server/dist/db/seed.js';

process.env.DB_FILE = `/tmp/dcf-dash-test-${Date.now()}.db`;
process.env.PORT = '8778';
process.env.NODE_ENV = 'test';

let passed = 0, failed = 0;
function assert(name, cond, detail = '') {
  if (cond) { console.log(`  ✅ ${name}${detail ? ' — ' + detail : ''}`); passed++; }
  else      { console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); failed++; }
}

const BASE = 'http://127.0.0.1:8778';
let TOKEN = '';

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

async function run() {
  console.log('\n═══ Dashboard Date Consistency Test ═══\n');

  runMigrations();
  runSeed();

  const app = createApp();
  const server = app.listen(8778, '127.0.0.1');

  try {
    // ── Login ──
    {
      const r = await api('POST', '/api/auth/login', { username: 'admin', password: 'admin123' });
      assert('Login', r.ok && r.data.token);
      TOKEN = r.data.token;
    }

    // ── Setup: customer + product + location + stock ──
    let customerId, productId, locationId;
    {
      const c = await api('POST', '/api/customers', { name: 'DashTestCust', type: 'credit' });
      customerId = c.data.id;
      const p = await api('POST', '/api/products', { name: 'DashTestProd', rate: 100, unit_type: 'kg' });
      productId = p.data.id;
      const loc = await api('GET', '/api/locations');
      locationId = loc.data.rows?.[0]?.id ?? (await api('POST', '/api/locations', { name: 'Shop' })).data.id;
      await api('POST', '/api/stock', {
        product_id: productId,
        location_id: locationId,
        bags: 100,
        bag_weight_kg: 50,
      });
      assert('Setup ready', !!customerId && !!productId && !!locationId);
    }

    // ── Insert 1 sale + 2 expenses with TODAY's PKT date ──
    const pktToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
    console.log(`\n  PKT today = ${pktToday}`);
    {
      const saleRes = await api('POST', '/api/sales', {
        items: [{ product_id: productId, quantity: 5, rate_per_bag: 100, unit_type: 'kg', bag_weight_kg: 50 }],
        customer_id: customerId,
        location_id: locationId,
        sale_date: pktToday,
        cash_received: 200,
        rickshaw_fare: 0,
        rickshaw_driver: null,
      });
      assert('Sale inserted', saleRes.ok, `status=${saleRes.status}`);

      const e1 = await api('POST', '/api/expenses', {
        description: 'Tea',
        amount: 50,
        expense_date: pktToday,
        category: 'misc',
      });
      const e2 = await api('POST', '/api/expenses', {
        description: 'Petrol',
        amount: 200,
        expense_date: pktToday,
        category: 'misc',
      });
      assert('2 expenses inserted', e1.ok && e2.ok, `e1=${e1.status} e2=${e2.status}`);
    }

    // ── TEST 1: Dashboard metrics (no date param) — should reflect today's PKT data ──
    console.log('\n── TEST 1: /api/reports/dashboard (no date param) ──');
    let metrics;
    {
      const r = await api('GET', '/api/reports/dashboard');
      metrics = r.data;
      console.log('  Metrics returned:', JSON.stringify(metrics));
      assert('Sales count = 1', metrics.salesTodayCount === 1, `got=${metrics.salesTodayCount}`);
      assert('Expenses total = 250', metrics.expensesToday === 250, `got=${metrics.expensesToday}`);
    }

    // ── TEST 2: Dashboard details — sales-today (no date param) — should also return 1 row ──
    console.log('\n── TEST 2: /api/reports/dashboard/details?type=sales-today (no date param) ──');
    {
      const r = await api('GET', `/api/reports/dashboard/details?type=sales-today&page=1&pageSize=10`);
      assert('Sales-today rows = 1', r.data.rows?.length === 1, `got=${r.data.rows?.length}`);
      assert('Sales-today total = 1', r.data.total === 1, `got=${r.data.total}`);
    }

    // ── TEST 3: Dashboard details — expenses-today (no date param) — should return 2 rows ──
    console.log('\n── TEST 3: /api/reports/dashboard/details?type=expenses-today (no date param) ──');
    {
      const r = await api('GET', `/api/reports/dashboard/details?type=expenses-today&page=1&pageSize=10`);
      assert('Expenses-today rows = 2', r.data.rows?.length === 2, `got=${r.data.rows?.length}`);
      assert('Expenses-today total = 2', r.data.total === 2, `got=${r.data.total}`);
    }

    // ── TEST 4: Cross-check — metrics number matches details row count ──
    console.log('\n── TEST 4: metrics ↔ details cross-check ──');
    {
      const salesDetails = await api('GET', `/api/reports/dashboard/details?type=sales-today&page=1&pageSize=10`);
      const expDetails = await api('GET', `/api/reports/dashboard/details?type=expenses-today&page=1&pageSize=10`);
      assert(
        'Metrics salesTodayCount === details sales-today total',
        metrics.salesTodayCount === salesDetails.data.total,
        `metrics=${metrics.salesTodayCount} details=${salesDetails.data.total}`
      );
      // Note: expensesToday metric is SUM(amount) — different from row count, but we
      // already validated both numbers reflect the same PKT date.
      assert(
        'Expenses details rows match inserted count (2)',
        expDetails.data.rows?.length === 2,
        `rows=${expDetails.data.rows?.length}`
      );
    }

    console.log(`\n═══ Result: ${passed} passed, ${failed} failed ═══\n`);
  } finally {
    server.close();
    process.exit(failed > 0 ? 1 : 0);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

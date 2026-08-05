/**
 * Verification script for the 3 newly-added modules' backend endpoints.
 * Tests the flat labour routes + customer inactive filter + customer-balance map.
 *
 * Usage: node scripts/test-modules.mjs
 */
const BASE = 'http://localhost:8000';
let TOKEN = '';
let passed = 0, failed = 0;

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

function assert(name, cond, detail = '') {
  if (cond) { console.log(`  ✅ ${name}${detail ? ' — ' + detail : ''}`); passed++; }
  else      { console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); failed++; }
}

async function run() {
  console.log('\n═══ Modules Verification Suite ═══\n');

  // ── Login ──
  console.log('── Auth ──');
  {
    const r = await api('POST', '/api/auth/login', { username: 'admin', password: 'admin123' });
    assert('Login', r.ok && r.data.token);
    TOKEN = r.data.token;
  }

  // ── Setup: create a labour + location ──
  console.log('\n── Setup ──');
  let labourId, locationId;
  {
    // Create location
    const locRes = await api('POST', '/api/locations', { name: `TestLoc-${Date.now()}` });
    if (locRes.ok) locationId = locRes.data.id;
    // Create labour
    const r = await api('POST', '/api/labours', {
      name: `TestLabour-${Date.now()}`,
      role: 'helper',
      daily_wage: 500,
      location_id: locationId,
      is_active: true,
    });
    assert('Create labour', r.ok, `status=${r.status}`);
    labourId = r.data.id;
  }

  // ── Labour payments (flat routes) ──
  console.log('\n── /api/labour-payments (flat) ──');
  let paymentId;
  {
    const today = new Date().toISOString().slice(0, 10);
    const r = await api('POST', '/api/labour-payments', {
      labour_id: labourId,
      payment_date: today,
      amount: 500,
      payment_type: 'salary',
      description: 'Test salary',
    });
    assert('POST /api/labour-payments', r.ok && r.data.id, `id=${r.data.id}`);
    paymentId = r.data.id;
  }
  {
    const r = await api('GET', '/api/labour-payments');
    assert('GET /api/labour-payments returns array', Array.isArray(r.data), `len=${r.data?.length}`);
    assert('  Row contains labour_name', r.data.length > 0 && r.data[0].labour_name, `name=${r.data[0]?.labour_name}`);
  }
  {
    const r = await api('GET', `/api/labour-payments?labour_id=${labourId}`);
    assert('GET with labour_id filter', r.ok && Array.isArray(r.data) && r.data.every(p => p.labour_id === labourId), `len=${r.data?.length}`);
  }
  {
    const r = await api('GET', `/api/labour-payments?location_id=${locationId}`);
    assert('GET with location_id filter', r.ok && Array.isArray(r.data), `len=${r.data?.length}`);
  }
  {
    const r = await api('DELETE', `/api/labour-payments/${paymentId}`);
    assert('DELETE /api/labour-payments/:id', r.ok && r.data.ok, `status=${r.status}`);
  }
  {
    const r = await api('GET', `/api/labour-payments?labour_id=${labourId}`);
    assert('Payment was actually deleted', Array.isArray(r.data) && r.data.length === 0);
  }

  // ── Labour daily wages (flat routes) ──
  console.log('\n── /api/labour-daily-wages (flat) ──');
  {
    const today = new Date().toISOString().slice(0, 10);
    const r = await api('POST', '/api/labour-daily-wages', {
      labour_id: labourId,
      wage_date: today,
      amount: 500,
      notes: 'Test wage',
      upsert: true,
    });
    assert('POST /api/labour-daily-wages (upsert)', r.ok && r.data.id, `id=${r.data.id}`);
  }
  {
    const today = new Date().toISOString().slice(0, 10);
    const r = await api('GET', `/api/labour-daily-wages?wage_date=${today}`);
    assert('GET returns { wages: [...] }', r.ok && Array.isArray(r.data.wages), `len=${r.data.wages?.length}`);
    assert('  Wage row contains labour_name', r.data.wages?.length > 0 && r.data.wages[0].labour_name, `name=${r.data.wages[0]?.labour_name}`);
  }
  {
    const today = new Date().toISOString().slice(0, 10);
    // Re-POST with upsert=true to verify it doesn't error on duplicate
    const r = await api('POST', '/api/labour-daily-wages', {
      labour_id: labourId,
      wage_date: today,
      amount: 600,
      upsert: true,
    });
    assert('POST upsert replaces existing row', r.ok, `status=${r.status}`);

    const g = await api('GET', `/api/labour-daily-wages?wage_date=${today}&labour_id=${labourId}`);
    const w = g.data.wages?.[0];
    assert('  Updated amount is 600', w && w.amount === 600, `amount=${w?.amount}`);
  }

  // ── Labour monthly summary (flat route) ──
  console.log('\n── /api/labour-monthly-summary (flat) ──');
  {
    const month = new Date().toISOString().slice(0, 7); // YYYY-MM
    const r = await api('GET', `/api/labour-monthly-summary?month=${month}`);
    assert('GET returns { summaries: [...] }', r.ok && Array.isArray(r.data.summaries), `len=${r.data.summaries?.length}`);
    assert('  Summary row has expected fields',
      r.data.summaries?.length > 0 &&
      typeof r.data.summaries[0].labour_id === 'number' &&
      typeof r.data.summaries[0].total_earned === 'number' &&
      typeof r.data.summaries[0].total_paid === 'number',
      `labour=${r.data.summaries[0]?.name}`);
  }
  {
    // Invalid month → empty summaries
    const r = await api('GET', '/api/labour-monthly-summary');
    assert('GET without month returns empty summaries', r.ok && Array.isArray(r.data.summaries) && r.data.summaries.length === 0);
  }

  // ── Customers: active/inactive filter ──
  console.log('\n── /api/customers ?active / ?inactive ──');
  let custId, custName;
  {
    custName = `Cust-${Date.now()}`;
    const r = await api('POST', '/api/customers', { name: custName, type: 'credit', opening_balance: 5000 });
    assert('Create test customer', r.ok && r.data.id, `id=${r.data.id}`);
    custId = r.data.id;
  }
  {
    const r = await api('GET', '/api/customers?active=true');
    assert('GET ?active=true returns only non-deleted',
      r.ok && r.data.rows.every(c => c.deleted_at === null), `rows=${r.data.rows?.length}`);
  }
  {
    const r = await api('GET', '/api/customers?inactive=true');
    assert('GET ?inactive=true returns only soft-deleted',
      r.ok && r.data.rows.every(c => c.deleted_at !== null), `rows=${r.data.rows?.length}`);
  }
  {
    // Soft-delete the test customer
    const r = await api('DELETE', `/api/customers/${custId}`);
    assert('Soft-delete customer', r.ok, `status=${r.status}`);
  }
  {
    const r = await api('GET', `/api/customers?inactive=true&search=${encodeURIComponent(custName)}`);
    assert('Soft-deleted customer appears in ?inactive=true list',
      r.ok && r.data.rows.some(c => c.id === custId && c.deleted_at !== null),
      `rows=${r.data.rows?.length}`);
  }
  {
    const r = await api('GET', `/api/customers?active=true&search=${encodeURIComponent(custName)}`);
    assert('Soft-deleted customer does NOT appear in ?active=true list',
      r.ok && !r.data.rows.some(c => c.id === custId),
      `rows=${r.data.rows?.length}`);
  }

  // ── Customer balance map (no ID) ──
  console.log('\n── /api/reports/customer-balance (no ID) ──');
  {
    const r = await api('GET', '/api/reports/customer-balance');
    assert('GET returns object map', r.ok && typeof r.data === 'object' && !Array.isArray(r.data), `keys=${Object.keys(r.data).length}`);
    const firstKey = Object.keys(r.data)[0];
    if (firstKey) {
      const b = r.data[firstKey];
      assert('  Map value has expected fields',
        typeof b.opening_balance === 'number' &&
        typeof b.total_bill === 'number' &&
        typeof b.balance_due === 'number',
        `key=${firstKey} balance_due=${b.balance_due}`);
    }
  }
  {
    // Single customer balance still works
    const r = await api('GET', '/api/reports/customer-balance/1');
    assert('GET /api/reports/customer-balance/:id still works', r.ok && typeof r.data.balance_due === 'number');
  }

  console.log(`\n═══ Results: ${passed} passed, ${failed} failed ═══\n`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});

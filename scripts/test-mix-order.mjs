/**
 * Verifies that POST /api/mix-orders accepts the location_id-aware payload
 * the frontend now sends (was missing location_id, causing "Validation fail hui").
 *
 * Spins up the server on port 8777, logs in, picks (or creates) a customer +
 * location + product, then POSTs a mix order and asserts the response is 201.
 *
 * Usage: node scripts/test-mix-order.mjs
 */
import { createApp } from '../server/dist/app.js';
import { runMigrations } from '../server/dist/db/migrate.js';
import { runSeed } from '../server/dist/db/seed.js';

// Use a fresh temp DB so we don't pollute dev data
process.env.DB_FILE = `/tmp/dcf-mix-test-${Date.now()}.db`;
process.env.PORT = '8777';
process.env.NODE_ENV = 'test';

let passed = 0, failed = 0;
function assert(name, cond, detail = '') {
  if (cond) { console.log(`  ✅ ${name}${detail ? ' — ' + detail : ''}`); passed++; }
  else      { console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); failed++; }
}

const BASE = 'http://127.0.0.1:8777';
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
  console.log('\n═══ Mix Order Validation Test ═══\n');

  runMigrations();
  runSeed();

  const app = createApp();
  const server = app.listen(8777, '127.0.0.1');

  try {
    // ── Login ──
    console.log('── Auth ──');
    {
      const r = await api('POST', '/api/auth/login', { username: 'admin', password: 'admin123' });
      assert('Login', r.ok && r.data.token);
      TOKEN = r.data.token;
    }

    // ── Pick (or create) location ──
    let locationId;
    console.log('\n── Setup ──');
    {
      const r = await api('GET', '/api/locations');
      if (r.ok && r.data.rows?.length) {
        locationId = r.data.rows[0].id;
      } else {
        const c = await api('POST', '/api/locations', { name: 'TestShop' });
        locationId = c.data.id;
      }
      assert('Location ready', !!locationId, `id=${locationId}`);
    }

    // ── Pick (or create) customer ──
    let customerId;
    {
      const r = await api('GET', '/api/customers');
      if (r.ok && r.data.rows?.length) {
        customerId = r.data.rows[0].id;
      } else {
        const c = await api('POST', '/api/customers', { name: 'TestCust', type: 'credit' });
        customerId = c.data.id;
      }
      assert('Customer ready', !!customerId, `id=${customerId}`);
    }

    // ── Pick (or create) product ──
    let productId;
    {
      const r = await api('GET', '/api/products');
      if (r.ok && r.data.rows?.length) {
        productId = r.data.rows[0].id;
      } else {
        const c = await api('POST', '/api/products', { name: 'TestProd', rate: 100, unit_type: 'kg' });
        productId = c.data.id;
      }
      assert('Product ready', !!productId, `id=${productId}`);
    }

    // ── Add stock for the product so mix-order can decrement ──
    {
      const r = await api('POST', '/api/stock', {
        product_id: productId,
        location_id: locationId,
        bags: 100,
        bag_weight_kg: 50,
      });
      assert('Stock seeded', r.ok, `status=${r.status}`);
    }

    // ── TEST 1: Old payload (no location_id) — should still fail ──
    console.log('\n── TEST 1: missing location_id → 422 (sanity check) ──');
    {
      const r = await api('POST', '/api/mix-orders', {
        customer_id: customerId,
        order_date: '2026-08-06',
        target_weight_kg: 100,
        items: [{ product_id: productId, quantity: 50, rate_per_kg: 100 }],
        cash_received: 0,
        driver_name: null,
        driver_rent: 0,
      });
      assert('Old payload rejected', r.status === 422, `status=${r.status}`);
      const msg = r.data?.error?.message ?? '';
      console.log(`     Server message: "${msg}"`);
      assert('Error mentions location_id', msg.includes('location_id'), `msg=${msg}`);
    }

    // ── TEST 2: New payload (with location_id) — should succeed ──
    console.log('\n── TEST 2: with location_id → 201 ──');
    {
      const r = await api('POST', '/api/mix-orders', {
        customer_id: customerId,
        location_id: locationId,
        order_date: '2026-08-06',
        target_weight_kg: 100,
        items: [{ product_id: productId, quantity: 50, rate_per_kg: 100 }],
        cash_received: 0,
        driver_name: null,
        driver_rent: 0,
      });
      assert('New payload accepted', r.ok && r.status === 201, `status=${r.status}`);
      assert('Response has id', !!r.data?.id, `id=${r.data?.id}`);
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

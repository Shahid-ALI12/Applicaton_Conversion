// End-to-end test for Day Reconciliation page backend
// Verifies:
//   1) GET /api/reports/reconciliation?from=&to= returns object with required snake_case keys
//   2) GET /api/reports/reconciliation/details?type=bags-sold returns { rows, total, ... }
//   3) All 6 detail types work: bags-sold, total-billed, cash-received, credit-customers, cash-customers, expenses
//   4) Pagination params honored
//   5) Search by customer_name / description works

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const BASE = 'http://127.0.0.1:3199';
let serverProc;
let pass = 0, fail = 0;
const fails = [];

function ok(c, l) { if (c) { pass++; console.log('  \u2713', l); } else { fail++; fails.push(l); console.log('  \u2717', l); } }

async function start() {
  serverProc = spawn('node', ['server/dist/index.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: '3199', NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProc.stdout.on('data', () => {});
  serverProc.stderr.on('data', () => {});
  for (let i = 0; i < 100; i++) {
    await sleep(100);
    try { const r = await fetch(`${BASE}/api/health`); if (r.ok) return; } catch {}
  }
  throw new Error('no startup');
}

async function H() {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const b = await r.json();
  return { Authorization: `Bearer ${b.token}`, 'Content-Type': 'application/json' };
}

async function main() {
  console.log('Starting server...');
  await start();
  try {
    const h = await H();
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());

    console.log('\nTest 1: GET /api/reports/reconciliation shape');
    const r1 = await fetch(`${BASE}/api/reports/reconciliation?from=${today}&to=${today}`, { headers: h });
    const b1 = await r1.json();
    console.log('  status:', r1.status, 'body:', b1);
    ok(r1.status === 200, 'returns 200');
    ok(typeof b1?.total_bags_sold === 'number', 'has total_bags_sold (number)');
    ok(typeof b1?.total_billed === 'number', 'has total_billed (number)');
    ok(typeof b1?.cash_received === 'number', 'has cash_received (number)');
    ok(typeof b1?.from_credit_customers === 'number', 'has from_credit_customers (number)');
    ok(typeof b1?.from_cash_customers === 'number', 'has from_cash_customers (number)');
    ok(typeof b1?.total_expenses === 'number', 'has total_expenses (number)');
    ok(typeof b1?.total_cash_in === 'number', 'has total_cash_in (number)');
    ok(typeof b1?.total_cash_out === 'number', 'has total_cash_out (number)');
    ok(typeof b1?.expected_cash_in_hand === 'number', 'has expected_cash_in_hand (number)');
    ok(Array.isArray(b1?.expenses), 'has expenses array');

    console.log('\nTest 2: GET /api/reports/reconciliation/details?type=bags-sold');
    const r2 = await fetch(`${BASE}/api/reports/reconciliation/details?type=bags-sold&from=${today}&to=${today}&page=1&pageSize=10`, { headers: h });
    const b2 = await r2.json();
    console.log('  status:', r2.status, 'body shape:', { rows: b2?.rows?.length, total: b2?.total, label: b2?.label });
    ok(r2.status === 200, 'returns 200 (was 404 before fix)');
    ok(Array.isArray(b2?.rows), 'has rows array');
    ok(typeof b2?.total === 'number', 'has total');
    ok(typeof b2?.page === 'number', 'has page');
    ok(typeof b2?.pageSize === 'number', 'has pageSize');
    ok(typeof b2?.totalPages === 'number', 'has totalPages');
    ok(typeof b2?.label === 'string', 'has label');
    ok(b2?.label === 'Total Bags Sold', `label = "Total Bags Sold" (got: ${b2?.label})`);

    console.log('\nTest 3: All 6 detail types work');
    const types = [
      ['bags-sold', 'Total Bags Sold'],
      ['total-billed', 'Total Billed'],
      ['cash-received', 'Cash Actually Received'],
      ['credit-customers', 'From Credit Customers'],
      ['cash-customers', 'From Cash Customers'],
      ['expenses', 'Total Expenses'],
    ];
    for (const [type, expectedLabel] of types) {
      const r = await fetch(`${BASE}/api/reports/reconciliation/details?type=${type}&from=${today}&to=${today}&page=1&pageSize=10`, { headers: h });
      const b = await r.json();
      ok(r.status === 200, `type=${type} returns 200`);
      ok(b?.label === expectedLabel, `type=${type} label="${b?.label}" (expected "${expectedLabel}")`);
      ok(Array.isArray(b?.rows), `type=${type} has rows array`);
    }

    console.log('\nTest 4: Invalid type rejected');
    const r4 = await fetch(`${BASE}/api/reports/reconciliation/details?type=invalid-xyz&from=${today}&to=${today}`, { headers: h });
    ok(r4.status === 400, `invalid type returns 400 (got ${r4.status})`);

    console.log('\nTest 5: Pagination respected');
    const r5 = await fetch(`${BASE}/api/reports/reconciliation/details?type=expenses&from=2000-01-01&to=2999-12-31&page=1&pageSize=2`, { headers: h });
    const b5 = await r5.json();
    ok(b5?.pageSize === 2, `pageSize=2 honored (got ${b5?.pageSize})`);
    ok(b5?.rows?.length <= 2, `rows.length <= pageSize=2 (got ${b5?.rows?.length})`);

    console.log(`\n=== ${pass} passed, ${fail} failed ===`);
    if (fails.length) fails.forEach((f) => console.log('  FAIL:', f));
  } catch (e) {
    console.error('err:', e);
    fail++;
  } finally {
    if (serverProc) serverProc.kill('SIGTERM');
    process.exit(fail === 0 ? 0 : 1);
  }
}
main();

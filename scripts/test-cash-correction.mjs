// End-to-end test: cash manual correction (Applicaton_Conversion Express backend)
// Verifies:
//   1) POST /api/cash/correction with old payload { account_id, target, name, reason }
//      (no correction_date) is now ACCEPTED — previously rejected with
//      "Validation fail hui — correction_date: Required"
//   2) POST returns 201 and { adjusted: true, ... } when target differs from current
//   3) POST returns { adjusted: false } when target === current balance
//   4) name + reason are required (backend rejects empty)
//   5) GET /api/cash/correction returns { corrections: [...] } including the new row
//   6) The new row has account_name, description starting with "Manual correction:"
//      and entered_by === name submitted

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const BASE = 'http://127.0.0.1:3199';

let serverProc;
let pass = 0, fail = 0;
const fails = [];

function ok(cond, label) {
  if (cond) { pass++; console.log('  ✓', label); }
  else { fail++; fails.push(label); console.log('  ✗', label); }
}

async function startServer() {
  serverProc = spawn('node', ['server/dist/index.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: '3199', NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProc.stdout.on('data', (d) => process.stdout.write('[srv] ' + d));
  serverProc.stderr.on('data', (d) => process.stderr.write('[srv-err] ' + d));
  // Wait for server to come up
  for (let i = 0; i < 100; i++) {
    await sleep(100);
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return; // server up
    } catch {}
  }
  throw new Error('Server did not start in 10s');
}

async function authHeaders() {
  // Login as admin/admin123 (seeded) to get JWT
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Login failed: ${r.status} ${t}`);
  }
  const body = await r.json();
  const token = body.token;
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function main() {
  console.log('Starting Express server on :3199 ...');
  await startServer();
  console.log('Server up.\n');

  try {
    const H = await authHeaders();

    // 1. Get accounts
    const accRes = await fetch(`${BASE}/api/cash/accounts`, { headers: H });
    const accounts = await accRes.json();
    ok(Array.isArray(accounts) && accounts.length > 0, 'GET /api/cash/accounts returns accounts array');
    const hand = accounts.find((a) => /hand/i.test(a.name)) || accounts[0];
    console.log(`  Using account: ${hand.name} (id=${hand.id})`);

    // 2. Get current balance
    const balRes = await fetch(`${BASE}/api/cash/balances`, { headers: H });
    const balances = await balRes.json();
    const cur = balances.find((b) => b.id === hand.id)?.balance ?? 0;
    console.log(`  Current balance: ${cur}`);

    // 3. POST with the OLD payload (no correction_date) — was rejected before fix
    const newTarget = cur + 500;
    console.log(`\nTest: POST correction (no correction_date) -> target ${newTarget}`);
    const postRes = await fetch(`${BASE}/api/cash/correction`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({
        account_id: hand.id,
        target: newTarget,
        name: 'Shahid (test)',
        reason: 'Cash short by Rs.500',
      }),
    });
    const postBody = await postRes.json();
    console.log('  status:', postRes.status, 'body:', postBody);
    ok(postRes.status === 201, 'POST returns 201 (was 422 before fix)');
    ok(postBody?.adjusted === true, 'adjusted: true returned');
    ok(typeof postBody?.diff === 'number', 'diff is a number');

    // 4. POST with same target again -> should be adjusted: false (no-op)
    console.log(`\nTest: POST correction (same target, should be no-op)`);
    const postRes2 = await fetch(`${BASE}/api/cash/correction`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({
        account_id: hand.id,
        target: newTarget,
        name: 'Shahid (test)',
        reason: 'Should be no-op',
      }),
    });
    const postBody2 = await postRes2.json();
    console.log('  status:', postRes2.status, 'body:', postBody2);
    ok(postRes2.status === 201, 'POST returns 201 even when no-op');
    ok(postBody2?.adjusted === false, 'adjusted: false when target === current');

    // 5. POST with empty name -> should be rejected with 400
    console.log(`\nTest: POST correction with empty name (should reject)`);
    const postRes3 = await fetch(`${BASE}/api/cash/correction`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({
        account_id: hand.id,
        target: newTarget + 100,
        name: '',
        reason: 'some reason',
      }),
    });
    const postBody3 = await postRes3.json();
    console.log('  status:', postRes3.status, 'body:', postBody3);
    ok(postRes3.status === 400 || postRes3.status === 422, `empty name rejected (got ${postRes3.status})`);

    // 6. GET /api/cash/correction — should include our new row
    console.log(`\nTest: GET corrections list`);
    const getRes = await fetch(`${BASE}/api/cash/correction`, { headers: H });
    const getBody = await getRes.json();
    console.log('  status:', getRes.status, 'count:', getBody?.corrections?.length);
    ok(getRes.status === 200, 'GET returns 200');
    ok(Array.isArray(getBody?.corrections), 'returns { corrections: [...] }');
    const lastCorr = getBody?.corrections?.[0];
    ok(!!lastCorr, 'at least one correction exists');
    ok(lastCorr?.account_name === hand.name, 'account_name matches');
    ok(typeof lastCorr?.description === 'string' && lastCorr.description.startsWith('Manual correction:'),
       `description starts with "Manual correction:" — got: ${lastCorr?.description}`);
    ok(lastCorr?.entered_by === 'Shahid (test)', `entered_by === name submitted — got: ${lastCorr?.entered_by}`);

    console.log(`\n=== Results: ${pass} passed, ${fail} failed ===`);
    if (fails.length) fails.forEach((f) => console.log('  FAIL:', f));
  } catch (e) {
    console.error('Test error:', e);
    fail++;
  } finally {
    if (serverProc) serverProc.kill('SIGTERM');
    process.exit(fail === 0 ? 0 : 1);
  }
}

main();

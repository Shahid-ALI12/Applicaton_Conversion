// Quick test: GET /api/cash/balances returns Record<string, number>
//               GET /api/cash/transfer returns { rows, total, page, ... }

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

    console.log('\nTest 1: GET /api/cash/balances (must be object keyed by name)');
    const r1 = await fetch(`${BASE}/api/cash/balances`, { headers: h });
    const b1 = await r1.json();
    console.log('  status:', r1.status, 'body:', b1);
    ok(r1.status === 200, 'returns 200');
    ok(!Array.isArray(b1), 'is NOT an array (was array before fix)');
    ok(typeof b1 === 'object' && b1 !== null, 'is object');
    ok(typeof b1['Cash In Hand'] === 'number', `'Cash In Hand' key has numeric value (got: ${b1['Cash In Hand']})`);
    ok(typeof b1['Cash In Locker'] === 'number', `'Cash In Locker' key has numeric value (got: ${b1['Cash In Locker']})`);

    console.log('\nTest 2: GET /api/cash/transfer (paginated history)');
    const r2 = await fetch(`${BASE}/api/cash/transfer?page=1&pageSize=20`, { headers: h });
    const b2 = await r2.json();
    console.log('  status:', r2.status, 'shape:', { rows_count: b2?.rows?.length, total: b2?.total, page: b2?.page, pageSize: b2?.pageSize, totalPages: b2?.totalPages });
    ok(r2.status === 200, 'returns 200');
    ok(Array.isArray(b2?.rows), 'returns { rows: [...] } array');
    ok(typeof b2?.total === 'number', 'total is number');
    ok(typeof b2?.page === 'number', 'page is number');
    ok(typeof b2?.pageSize === 'number', 'pageSize is number');
    ok(typeof b2?.totalPages === 'number', 'totalPages is number');
    // Check at least one transfer has nested from_account / to_account (if any transfers exist)
    if (b2?.rows?.length > 0) {
      const t = b2.rows[0];
      ok(typeof t?.from_account === 'object' && t?.from_account !== null, 'row has from_account nested object');
      ok(typeof t?.to_account === 'object' && t?.to_account !== null, 'row has to_account nested object');
      ok(typeof t?.from_account?.name === 'string', 'from_account.name is string');
      ok(typeof t?.to_account?.name === 'string', 'to_account.name is string');
    }

    console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  } catch (e) {
    console.error('err:', e);
    fail++;
  } finally {
    if (serverProc) serverProc.kill('SIGTERM');
    process.exit(fail === 0 ? 0 : 1);
  }
}
main();

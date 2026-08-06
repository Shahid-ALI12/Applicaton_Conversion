// Reproduction test: confirms the old apiFetch bug.
// Before fix: apiFetch forced "Content-Type: application/json" on FormData bodies.
// This caused express.json() to try parsing the multipart body as JSON →
//   "Unexpected token '-', '------WebK'... is not valid JSON"
//
// This script simulates BOTH the buggy behavior AND the fixed behavior,
// so we can prove the fix resolves the user's exact error.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { writeFileSync, readFileSync } from 'node:fs';

const BASE = 'http://127.0.0.1:3198';
let serverProc;

async function start() {
  serverProc = spawn('node', ['server/dist/index.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: '3198', NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProc.stdout.on('data', () => {});
  serverProc.stderr.on('data', () => {});
  for (let i = 0; i < 100; i++) {
    await sleep(100);
    try { const r = await fetch(`${BASE}/api/health`); if (r.ok) return; } catch {}
  }
  throw new Error('server did not start');
}

async function login() {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const b = await r.json();
  return { Authorization: `Bearer ${b.token}` };
}

async function main() {
  console.log('Starting server on port 3198...');
  await start();
  try {
    const h = await login();

    // Download a valid backup to use for restore test
    const dl = await fetch(`${BASE}/api/database/backup`, { headers: h });
    const buf = Buffer.from(await dl.arrayBuffer());
    writeFileSync('/tmp/repro-backup.db', buf);
    console.log(`Downloaded backup: ${buf.length} bytes`);

    // ─── Test A: BUGGY behavior (what the old apiFetch did) ───
    // Force Content-Type: application/json on a FormData body.
    console.log('\n--- Test A: simulate OLD buggy apiFetch (forces application/json on FormData) ---');
    const formBuggy = new FormData();
    formBuggy.append('file', new Blob([buf]), 'repro-backup.db');
    const rA = await fetch(`${BASE}/api/database/restore`, {
      method: 'POST',
      headers: { ...h, 'Content-Type': 'application/json' }, // ← the bug
      body: formBuggy,
    });
    const bodyA = await rA.text();
    console.log(`  Status: ${rA.status}`);
    console.log(`  Response body (first 200 chars): ${bodyA.slice(0, 200)}`);
    let bodyAjson;
    try { bodyAjson = JSON.parse(bodyA); } catch { bodyAjson = null; }
    if (bodyAjson?.error?.message?.includes('Unexpected token')) {
      console.log('  ✓ CONFIRMED: buggy behavior produces the EXACT error the user saw:');
      console.log(`    "${bodyAjson.error.message}"`);
    } else {
      console.log('  (buggy behavior did not produce expected error — investigate)');
    }

    // ─── Test B: FIXED behavior (what the new apiFetch does) ───
    // Let the browser/fetch set Content-Type automatically for FormData.
    console.log('\n--- Test B: simulate FIXED apiFetch (lets FormData set its own Content-Type) ---');
    const formFixed = new FormData();
    formFixed.append('file', new Blob([buf]), 'repro-backup.db');
    const rB = await fetch(`${BASE}/api/database/restore`, {
      method: 'POST',
      headers: h, // ← NO Content-Type — fetch sets multipart/form-data; boundary=... automatically
      body: formFixed,
    });
    const bodyB = await rB.json();
    console.log(`  Status: ${rB.status}`);
    console.log(`  Response: ok=${bodyB.ok}, message="${bodyB.message?.slice(0, 80)}..."`);
    if (rB.status === 200 && bodyB.ok === true) {
      console.log('  ✓ CONFIRMED: fixed behavior restores successfully');
    } else {
      console.log('  ✗ FIXED behavior failed — something else is wrong');
    }

    console.log('\n=== Diagnosis complete ===');
    console.log('The bug was: apiFetch forced Content-Type: application/json on FormData bodies.');
    console.log('The fix: skip setting Content-Type when body is FormData — let the browser set multipart/form-data.');
  } catch (e) {
    console.error('Test error:', e);
  } finally {
    if (serverProc) serverProc.kill('SIGTERM');
    process.exit(0);
  }
}
main();

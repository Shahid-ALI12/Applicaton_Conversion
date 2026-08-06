// End-to-end test: database backup + restore (binary .db files)
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync, copyFileSync, statSync } from 'node:fs';
import path from 'node:path';

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
  return { Authorization: `Bearer ${b.token}` };
}

async function main() {
  console.log('Starting server...');
  await start();
  try {
    const h = await H();

    console.log('\nTest 1: GET /api/database/info');
    const r1 = await fetch(`${BASE}/api/database/info`, { headers: h });
    const b1 = await r1.json();
    console.log('  status:', r1.status, 'info:', b1);
    ok(r1.status === 200, 'returns 200');
    ok(typeof b1?.size === 'number' && b1.size > 0, `size is positive number (got ${b1?.size})`);
    ok(typeof b1?.sizeFormatted === 'string', 'has sizeFormatted');
    ok(typeof b1?.lastModified === 'string', 'has lastModified');
    ok(typeof b1?.counts === 'object', 'has counts object');
    ok(typeof b1?.counts?.products === 'number', 'counts.products is number');

    console.log('\nTest 2: GET /api/database/backup (download .db file)');
    const r2 = await fetch(`${BASE}/api/database/backup`, { headers: h });
    const buf = Buffer.from(await r2.arrayBuffer());
    const disp = r2.headers.get('content-disposition') || '';
    console.log('  status:', r2.status, 'size:', buf.length, 'disposition:', disp);
    ok(r2.status === 200, 'returns 200');
    ok(buf.length > 0, 'body is non-empty buffer');
    ok(disp.includes('attachment'), 'Content-Disposition has attachment');
    ok(disp.includes('danishcattlefeed-backup-'), 'filename pattern matches');
    ok(disp.includes('.db'), 'filename has .db extension');
    // SQLite file magic header: "SQLite format 3\0"
    const magic = buf.slice(0, 16).toString();
    ok(magic.startsWith('SQLite format 3'), `body starts with SQLite magic header (got: ${magic.slice(0, 16)})`);

    // Save the downloaded backup for restore test
    const dlPath = '/tmp/test-backup.db';
    writeFileSync(dlPath, buf);
    console.log('  Saved downloaded backup to:', dlPath, '(' + buf.length + ' bytes)');

    console.log('\nTest 3: POST /api/database/restore (upload the .db we just downloaded)');
    // Note: this should restore to the same DB (no-op effectively)
    const form = new FormData();
    form.append('file', new Blob([buf]), 'test-backup.db');
    const r3 = await fetch(`${BASE}/api/database/restore`, {
      method: 'POST',
      headers: h,
      body: form,
    });
    const b3 = await r3.json();
    console.log('  status:', r3.status, 'body:', b3);
    ok(r3.status === 200, 'returns 200');
    ok(b3?.ok === true, 'body has ok: true');
    ok(typeof b3?.safetyBackup === 'string', 'has safetyBackup path');
    ok(typeof b3?.newDbSize === 'string', 'has newDbSize');

    console.log('\nTest 4: POST /api/database/restore with .db file containing invalid content');
    // Real-world: file has .db extension but is not a valid SQLite database
    const fakeBuf = Buffer.from('this is not a sqlite file - just plain text');
    const form2 = new FormData();
    form2.append('file', new Blob([fakeBuf]), 'fake-backup.db');
    const r4 = await fetch(`${BASE}/api/database/restore`, {
      method: 'POST',
      headers: h,
      body: form2,
    });
    const b4 = await r4.json();
    console.log('  status:', r4.status, 'body:', b4);
    ok(r4.status === 400, `invalid file rejected with 400 (got ${r4.status})`);
    ok(b4?.error?.code === 'INVALID_BACKUP', `error code = INVALID_BACKUP (got ${b4?.error?.code})`);

    console.log('\nTest 5: POST /api/database/restore with no file');
    const r5 = await fetch(`${BASE}/api/database/restore`, {
      method: 'POST',
      headers: h,
    });
    const b5 = await r5.json();
    console.log('  status:', r5.status, 'body:', b5);
    ok(r5.status === 400, `no-file rejected with 400 (got ${r5.status})`);

    console.log('\nTest 6: GET /api/database/backup requires admin auth (no token)');
    const r6 = await fetch(`${BASE}/api/database/backup`);
    ok(r6.status === 401 || r6.status === 403, `unauthenticated returns 401/403 (got ${r6.status})`);

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

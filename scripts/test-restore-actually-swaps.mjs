// Verify that the restore actually swaps the DB and the running process
// sees the NEW data after restore (this proves close+swap+reopen works).
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';

const BASE = 'http://127.0.0.1:3197';
let serverProc;

async function start() {
  serverProc = spawn('node', ['server/dist/index.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: '3197', NODE_ENV: 'test' },
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
  console.log('Starting server on port 3197...');
  await start();
  try {
    const h = await login();

    // 1. Capture current product count
    console.log('\n[1] Capture current product count');
    const r1 = await fetch(`${BASE}/api/products?pageSize=1`, { headers: h });
    const b1 = await r1.json();
    const beforeCount = b1.total;
    console.log(`  Products before: ${beforeCount}`);

    // 2. Download a backup of the current DB
    console.log('\n[2] Download backup of current DB');
    const r2 = await fetch(`${BASE}/api/database/backup`, { headers: h });
    const buf = Buffer.from(await r2.arrayBuffer());
    writeFileSync('/tmp/e2e-backup-before.db', buf);
    console.log(`  Backup saved: ${buf.length} bytes`);

    // 3. Add a new product (so the live DB now has more products than the backup)
    console.log('\n[3] Add a new product to the live DB');
    const r3 = await fetch(`${BASE}/api/products`, {
      method: 'POST',
      headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'TEST_PRODUCT_RESTORE_VERIFY',
        unit: 'kg',
        rate: 999,
        category: 'test',
      }),
    });
    const b3 = await r3.json();
    console.log(`  Created product id=${b3.id} name=${b3.name}`);

    // 4. Verify the new count is higher
    const r4 = await fetch(`${BASE}/api/products?pageSize=1`, { headers: h });
    const b4 = await r4.json();
    const afterAddCount = b4.total;
    console.log(`  Products after add: ${afterAddCount} (should be ${beforeCount + 1})`);
    if (afterAddCount !== beforeCount + 1) {
      console.log('  ✗ Product count did not increase as expected');
    } else {
      console.log('  ✓ Product was added');
    }

    // 5. Restore the backup (the snapshot from BEFORE the new product was added)
    console.log('\n[5] Restore the backup taken before adding the product');
    const form = new FormData();
    form.append('file', new Blob([buf]), 'e2e-backup-before.db');
    const r5 = await fetch(`${BASE}/api/database/restore`, {
      method: 'POST',
      headers: h,
      body: form,
    });
    const b5 = await r5.json();
    console.log(`  Restore: status=${r5.status}, ok=${b5.ok}`);
    if (r5.status !== 200 || b5.ok !== true) {
      console.log('  ✗ Restore failed!');
      console.log('  Body:', b5);
      return;
    }

    // 6. Check product count again — should be back to beforeCount
    console.log('\n[6] Verify product count after restore (should match the backup state)');
    const r6 = await fetch(`${BASE}/api/products?pageSize=1`, { headers: h });
    const b6 = await r6.json();
    const afterRestoreCount = b6.total;
    console.log(`  Products after restore: ${afterRestoreCount} (should be ${beforeCount})`);
    if (afterRestoreCount === beforeCount) {
      console.log('  ✓✓✓ RESTORE WORKS! The running process sees the restored (older) DB state.');
      console.log('     This proves close+swap+reopen is functioning correctly.');
    } else {
      console.log('  ✗ Restore did NOT take effect in the running process.');
      console.log('     The DB file may have been swapped but the connection was not reopened.');
    }
  } catch (e) {
    console.error('Test error:', e);
  } finally {
    if (serverProc) serverProc.kill('SIGTERM');
    process.exit(0);
  }
}
main();

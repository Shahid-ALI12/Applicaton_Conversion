#!/usr/bin/env node
/**
 * Danish Cattle Feed Software — License Keygen v2 (SELLER-ONLY TOOL)
 *
 * Har activation code mein 4 cheezeyn hoti hain:
 *   m = Machine ID  (XXXX-XXXX — customer ke PC se aata hai)
 *   n = Customer Name  (login pe display hone wala naam)
 *   p = Password  (bcrypt hash — admin user ka password set/update hota hai)
 *   e = Expiry  (YYYY-MM-DD — license kab tak valid hai)
 *
 * Payload JSON mein Ed25519 se sign hota hai. App sirf public key
 * se verify karta hai — private key sirf seller ke paas hoti hai.
 *
 * ── Usage ──
 *
 *   # 1. Pehli dafaa (keypair generate karo)
 *   node keygen.mjs init
 *
 *   # 2a. Interactive mode (recommended — prompts dega)
 *   node keygen.mjs code
 *
 *   # 2b. CLI mode (scripting ke liye)
 *   node keygen.mjs code \
 *     --machine 3EE4-35A6 \
 *     --name "Ahmad Khan" \
 *     --password "secret123" \
 *     --months 1
 *
 *   # Duration options (koi ek):
 *     --months 1     (1 mahine baad expire)
 *     --months 12    (1 saal baad expire)
 *     --days 45      (45 din baad expire)
 *     --until 2026-12-31  (specific date tak)
 *
 *   # 3. Recent codes ki list dekhne ke liye
 *   node keygen.mjs list
 */
import { generateKeyPairSync, createPrivateKey, sign } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const keysDir = path.join(here, 'keys');
const privateKeyFile = path.join(keysDir, 'private.pem');
const publicKeyFile = path.join(keysDir, 'public.pem');
const logFile = path.join(here, 'codes.log');

const [, , command, ...rest] = process.argv;

function arg(name) {
  const index = rest.indexOf(`--${name}`);
  return index >= 0 ? rest[index + 1] : undefined;
}
function fail(message) { console.error(`\n❌ ${message}\n`); process.exit(1); }
function todayISO() { return new Date().toISOString().slice(0, 10); }

/* ─────────────────────────────────────────────
 *  INIT — Ed25519 keypair generate karo
 * ───────────────────────────────────────────── */
if (command === 'init') {
  if (existsSync(privateKeyFile)) fail('keys/private.pem pehle se mojood hai — overwrite nahi karunga.');
  mkdirSync(keysDir, { recursive: true });
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  writeFileSync(privateKeyFile, privateKey.export({ type: 'pkcs8', format: 'pem' }));
  writeFileSync(publicKeyFile, publicKey.export({ type: 'spki', format: 'pem' }));
  console.log('\n✅ Keypair ban gaya.\n');
  console.log('PUBLIC KEY (server/src/services/license.ts mein embed hoti hai):\n');
  console.log(readFileSync(publicKeyFile, 'utf8'));
  console.log('⚠️  keys/private.pem ko mehfooz rakhein — yehi aap ka licensing raaz hai.');
  console.log('⚠️  keys/ folder ka backup zaroor rakhein.\n');
  process.exit(0);
}

/* ─────────────────────────────────────────────
 *  CODE — activation code generate karo
 * ───────────────────────────────────────────── */
if (command === 'code') {
  if (!existsSync(privateKeyFile)) {
    fail('Pehle "node keygen.mjs init" chalayen — keys/private.pem nahi mila.');
  }

  const cliMachine = arg('machine');
  const cliName = arg('name');
  const cliPassword = arg('password');
  const cliMonths = arg('months');
  const cliDays = arg('days');
  const cliUntil = arg('until');

  let machine, name, password, until;

  // ── CLI mode (agar saari values di gayi hain) ──
  if (cliMachine && cliName && cliPassword) {
    machine = cliMachine.toUpperCase().trim();
    name = cliName.trim();
    password = cliPassword;
    until = computeUntil(cliMonths, cliDays, cliUntil);
  } else {
    // ── Interactive mode ──
    const result = await interactiveInput();
    machine = result.machine;
    name = result.name;
    password = result.password;
    until = result.until;
  }

  // ── Validation ──
  if (!/^[0-9A-F]{4}-[0-9A-F]{4}$/.test(machine)) {
    fail(`Machine ID format ghalat hai: "${machine}" — format XXXX-XXXX (e.g. 3EE4-35A6)`);
  }
  if (!name || name.length < 2) {
    fail('Customer Name kam se kam 2 characters ka hona chahiye.');
  }
  if (!password || password.length < 6) {
    fail('Password kam se kam 6 characters ka hona chahiye.');
  }
  if (!until || !/^\d{4}-\d{2}-\d{2}$/.test(until)) {
    fail(`Expiry date format ghalat hai: "${until}" — format YYYY-MM-DD`);
  }
  if (new Date(until) <= new Date(todayISO())) {
    fail(`Expiry date (${until}) aaj ke baad ki honi chahiye.`);
  }

  // ── Generate code ──
  const hash = bcrypt.hashSync(password, 11);
  const payload = JSON.stringify({ m: machine, n: name, p: hash, e: until });
  const privateKey = createPrivateKey(readFileSync(privateKeyFile, 'utf8'));
  const signature = sign(null, Buffer.from(payload, 'utf8'), privateKey);
  const code = `${Buffer.from(payload, 'utf8').toString('base64url')}.${signature.toString('base64url')}`;

  // ── Log to file ──
  const logLine = `[${new Date().toISOString()}] machine=${machine} name="${name}" until=${until}`;
  appendFileSync(logFile, logLine + '\n', 'utf8');

  // ── Output ──
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  ✅  ACTIVATION CODE GENERATE HO GAYA');
  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log(code);
  console.log('\n═══════════════════════════════════════════════════════════════\n');
  console.log(`  Customer : ${name}`);
  console.log(`  Machine  : ${machine}`);
  console.log(`  Username : admin  (fixed)`);
  console.log(`  Password : ${'*'.repeat(Math.min(password.length, 20))} (${password.length} chars)`);
  console.log(`  Valid    : ${until} tak`);
  console.log('');
  console.log('  💡  Code ko copy karke customer ko WhatsApp karein.');
  console.log(`  📝  Code log file mein bhi save hua: ${path.basename(logFile)}`);
  console.log('');
  process.exit(0);
}

/* ─────────────────────────────────────────────
 *  LIST — recent codes ki list
 * ───────────────────────────────────────────── */
if (command === 'list') {
  if (!existsSync(logFile)) {
    console.log('\n📋 Abhi tak koi code generate nahi hua.\n');
    process.exit(0);
  }
  const lines = readFileSync(logFile, 'utf8').trim().split('\n').reverse();
  console.log(`\n📋 Recent ${lines.length} code(s):\n`);
  console.log('─'.repeat(80));
  for (const line of lines.slice(0, 50)) {
    console.log(line);
  }
  console.log('─'.repeat(80));
  console.log(`Total: ${lines.length} code(s) logged\n`);
  process.exit(0);
}

/* ─────────────────────────────────────────────
 *  HELP
 * ───────────────────────────────────────────── */
console.log(`
Danish Cattle Feed — License Keygen v2

Usage:
  node keygen.mjs init                    Generate Ed25519 keypair (pehli dafaa)
  node keygen.mjs code                    Interactive mode (recommended)
  node keygen.mjs list                    Recent generated codes ki list

  node keygen.mjs code \\
    --machine XXXX-XXXX \\
    --name "Customer Name" \\
    --password "secret123" \\
    --months 1                            CLI mode (--days N ya --until YYYY-MM-DD bhi)

Duration (koi ek):
  --months 1        1 mahine baad expire
  --months 12       1 saal baad expire
  --days 45         45 din baad expire
  --until 2026-12-31  specific date tak valid
`);

/* ─────────────────────────────────────────────
 *  Helper: computeUntil
 * ───────────────────────────────────────────── */
function computeUntil(months, days, until) {
  if (until) return until;
  const d = new Date();
  const m = Number(months);
  const dy = Number(days);
  if (m > 0) d.setMonth(d.getMonth() + m);
  else if (dy > 0) d.setDate(d.getDate() + dy);
  else d.setMonth(d.getMonth() + 1); // default 1 month
  return d.toISOString().slice(0, 10);
}

/* ─────────────────────────────────────────────
 *  Helper: interactiveInput
 * ───────────────────────────────────────────── */
async function interactiveInput() {
  const rl = readline.createInterface({ input: stdin, output: stdout });

  try {
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║   Danish Cattle Feed — License Code Generator               ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    // Machine ID
    let machine = '';
    while (true) {
      machine = (await rl.question('🔹 Machine ID (XXXX-XXXX): ')).toUpperCase().trim();
      if (/^[0-9A-F]{4}-[0-9A-F]{4}$/.test(machine)) break;
      console.log('   ❌ Format ghalat hai. Example: 3EE4-35A6\n');
    }

    // Customer Name
    let name = '';
    while (true) {
      name = (await rl.question('🔹 Customer Name: ')).trim();
      if (name.length >= 2) break;
      console.log('   ❌ Name kam se kam 2 characters ka hona chahiye.\n');
    }

    // Password
    let password = '';
    while (true) {
      password = (await rl.question('🔹 Password (min 6 chars): ')).trim();
      if (password.length >= 6) break;
      console.log('   ❌ Password kam se kam 6 characters ka hona chahiye.\n');
    }

    // Duration
    console.log('\n🔹 Duration select karein:');
    console.log('   [1] Monthly  (1 month)');
    console.log('   [2] Quarterly (3 months)');
    console.log('   [3] Yearly   (12 months)');
    console.log('   [4] Custom   (N days)');
    console.log('   [5] Exact date (YYYY-MM-DD)');

    let until = '';
    const choice = (await rl.question('\n   Choice [1-5]: ')).trim();
    switch (choice) {
      case '1': until = computeUntil(1, 0, null); break;
      case '2': until = computeUntil(3, 0, null); break;
      case '3': until = computeUntil(12, 0, null); break;
      case '4': {
        const days = Number(await rl.question('   Days: '));
        if (!days || days < 1) fail('Ghalat days value.');
        until = computeUntil(0, days, null);
        break;
      }
      case '5': {
        until = (await rl.question('   Date (YYYY-MM-DD): ')).trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(until)) fail('Format YYYY-MM-DD hona chahiye.');
        break;
      }
      default: fail('Invalid choice.');
    }

    if (new Date(until) <= new Date(todayISO())) {
      fail(`Expiry date (${until}) aaj ke baad ki honi chahiye.`);
    }

    // Summary + confirm
    console.log('\n─'.repeat(63));
    console.log(`  Machine  : ${machine}`);
    console.log(`  Name     : ${name}`);
    console.log(`  Username : admin  (fixed)`);
    console.log(`  Password : ${'*'.repeat(Math.min(password.length, 20))} (${password.length} chars)`);
    console.log(`  Valid    : ${until} tak`);
    console.log('─'.repeat(63));

    const confirm = (await rl.question('\n✓ Code generate karein? [y/N]: ')).trim().toLowerCase();
    if (confirm !== 'y' && confirm !== 'yes') {
      console.log('\nCancelled.\n');
      process.exit(0);
    }

    return { machine, name, password, until };
  } finally {
    rl.close();
  }
}

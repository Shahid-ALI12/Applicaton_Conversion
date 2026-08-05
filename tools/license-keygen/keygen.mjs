#!/usr/bin/env node
/**
 * Danish Cattle Feed Software — License Keygen v3 (SELLER-ONLY TOOL)
 *
 * Commands:
 *   init                    Generate Ed25519 keypair (pehli dafaa)
 *   sync                    Public key ko source + bundled desktop app mein
 *                           copy karega (har baar init ke baad chalayen!)
 *   code                    Interactive mode — naya activation code
 *   list [--search QUERY]   Saare generated codes ki list (search supported)
 *   delete                  Code delete karna (machine-id / name / line# se)
 *   help                    Ye help
 *
 * ── Code generation (CLI mode) ──
 *   node keygen.mjs code \
 *     --machine 3EE4-35A6 \
 *     --name "Ahmad Khan" \
 *     --password "secret123" \
 *     --months 1
 *
 * Duration: --months N | --days N | --until YYYY-MM-DD
 *
 * ── List / Search ──
 *   node keygen.mjs list
 *   node keygen.mjs list --search ahmad
 *   node keygen.mjs list --search 3EE4-35A6
 *
 * ── Delete ──
 *   node keygen.mjs delete                  (interactive)
 *   node keygen.mjs delete --machine 3EE4-35A6
 *   node keygen.mjs delete --name "Ahmad Khan"
 *   node keygen.mjs delete --line 2
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

// Repo ke andar public key ke 3 locations:
//   1. Source:        server/src/services/license.ts
//   2. Bundled:       desktop/server/services/license.js
//   3. Keygen itself: tools/license-keygen/keys/public.pem
const REPO_ROOT = path.resolve(here, '..', '..');
const PUBLIC_KEY_TARGETS = [
  path.join(REPO_ROOT, 'server', 'src', 'services', 'license.ts'),
  path.join(REPO_ROOT, 'desktop', 'server', 'services', 'license.js'),
];

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
  if (existsSync(privateKeyFile)) {
    console.log('\n⚠️  keys/private.pem pehle se mojood hai.');
    const rl = readline.createInterface({ input: stdin, output: stdout });
    const ans = (await rl.question('Overwrite karein? Purani keys se banaye gaye saare codes invalid ho jaayenge! [y/N]: ')).trim().toLowerCase();
    rl.close();
    if (ans !== 'y' && ans !== 'yes') { console.log('Cancelled.'); process.exit(0); }
  }
  mkdirSync(keysDir, { recursive: true });
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  writeFileSync(privateKeyFile, privateKey.export({ type: 'pkcs8', format: 'pem' }));
  writeFileSync(publicKeyFile, publicKey.export({ type: 'spki', format: 'pem' }));
  console.log('\n✅ Keypair ban gaya.\n');
  console.log('PUBLIC KEY:\n');
  console.log(readFileSync(publicKeyFile, 'utf8'));
  console.log('⚠️  Ab zaroor chalayen:  node keygen.mjs sync');
  console.log('⚠️  keys/private.pem ko mehfooz rakhein — yehi aap ka licensing raaz hai.\n');
  process.exit(0);
}

/* ─────────────────────────────────────────────
 *  SYNC — public key ko source + bundled file mein update karo
 *
 *  Ye CRITICAL command hai. Har baar `init` ke baad chalana
 *  zaroori hai, warna keygen jo private key se sign karega,
 *  uska signature app verify nahi kar paayegi (kyunki app
 *  mein purani public key bundled ho gi).
 * ───────────────────────────────────────────── */
if (command === 'sync') {
  if (!existsSync(publicKeyFile)) fail('Pehle "node keygen.mjs init" chalayen — public.pem nahi mila.');

  const pemContent = readFileSync(publicKeyFile, 'utf8').trim();
  // PEM ke andar ka base64 part nikaalo (lines between BEGIN/END)
  const pemBody = pemContent.split('\n').filter(l => !l.startsWith('-----')).join('');

  let updated = 0;
  let skipped = 0;

  for (const target of PUBLIC_KEY_TARGETS) {
    if (!existsSync(target)) {
      console.log(`  ⏭  Skip: ${path.relative(REPO_ROOT, target)} (file nahi mila — build nahi hua?)`);
      skipped++;
      continue;
    }
    const original = readFileSync(target, 'utf8');
    // PEM ko multiline template literal mein replace karte hain.
    // Pattern: -----BEGIN PUBLIC KEY-----\n<any base64>\n-----END PUBLIC KEY-----
    const pemRegex = /-----BEGIN PUBLIC KEY-----\s*\n[0-9A-Za-z+/=]+\n-----END PUBLIC KEY-----/;
    if (!pemRegex.test(original)) {
      console.log(`  ⚠️  Skip: ${path.relative(REPO_ROOT, target)} (PEM block nahi mila)`);
      skipped++;
      continue;
    }
    const newPemBlock = `-----BEGIN PUBLIC KEY-----\n${pemBody}\n-----END PUBLIC KEY-----`;
    const updated_content = original.replace(pemRegex, newPemBlock);
    if (updated_content === original) {
      console.log(`  ✓  Already up-to-date: ${path.relative(REPO_ROOT, target)}`);
      continue;
    }
    writeFileSync(target, updated_content, 'utf8');
    console.log(`  ✅  Updated: ${path.relative(REPO_ROOT, target)}`);
    updated++;
  }

  console.log(`\nSummary: ${updated} file(s) update hui, ${skipped} skip hui.`);
  if (updated > 0) {
    console.log('\n💡  Ab agar desktop app already built hai, toh customer ko naya build bhejna padega.');
    console.log('    Ya phir bundled desktop/server/services/license.js directly update ho gaya hai —');
    console.log('    customer sirf app restart kare toh bhi kaam kar jaayega.');
  }
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

  if (cliMachine && cliName && cliPassword) {
    machine = cliMachine.toUpperCase().trim();
    name = cliName.trim();
    password = cliPassword;
    until = computeUntil(cliMonths, cliDays, cliUntil);
  } else {
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

  // ── Duplicate check (same machine-id + non-expired entry) ──
  const entries = readLogEntries();
  const duplicates = entries.filter(e => e.machine === machine && e.until > todayISO() && !e.deleted);
  if (duplicates.length > 0) {
    console.log(`\n⚠️  WARNING: Is machine ke liye pehle se ${duplicates.length} active code(s) mojood hain:`);
    duplicates.forEach((d, i) => {
      console.log(`   [${d.line}] ${d.name} — valid till ${d.until} (generated ${d.timestamp.slice(0,10)})`);
    });
    const rl = readline.createInterface({ input: stdin, output: stdout });
    const ans = (await rl.question('\nPhir bhi naya code generate karein? [y/N]: ')).trim().toLowerCase();
    rl.close();
    if (ans !== 'y' && ans !== 'yes') { console.log('Cancelled.'); process.exit(0); }
  }

  // ── Generate code ──
  const hash = bcrypt.hashSync(password, 11);
  const payload = JSON.stringify({ m: machine, n: name, p: hash, e: until });
  const privateKey = createPrivateKey(readFileSync(privateKeyFile, 'utf8'));
  const signature = sign(null, Buffer.from(payload, 'utf8'), privateKey);
  const code = `${Buffer.from(payload, 'utf8').toString('base64url')}.${signature.toString('base64url')}`;

  // ── Log to file (JSONL format) ──
  const logEntry = {
    timestamp: new Date().toISOString(),
    machine,
    name,
    until,
    password_length: password.length,
    deleted: false,
  };
  appendFileSync(logFile, JSON.stringify(logEntry) + '\n', 'utf8');

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
 *  LIST — saare codes ki list (search ke saath)
 * ───────────────────────────────────────────── */
if (command === 'list') {
  const searchQuery = arg('search')?.toLowerCase().trim();
  let entries = readLogEntries();

  // Sirf non-deleted entries by default (deleted bhi dekhne ke liye --all)
  const showAll = rest.includes('--all');
  if (!showAll) entries = entries.filter(e => !e.deleted);

  if (entries.length === 0) {
    console.log(showAll ? '\n📋 Abhi tak koi code generate nahi hua.\n' : '\n📋 Koi active code nahi mila. (--all se deleted bhi dekhein)\n');
    process.exit(0);
  }

  // Search filter
  if (searchQuery) {
    entries = entries.filter(e =>
      e.name.toLowerCase().includes(searchQuery) ||
      e.machine.toLowerCase().includes(searchQuery) ||
      (e.until && e.until.includes(searchQuery))
    );
    if (entries.length === 0) {
      console.log(`\n🔍 "${searchQuery}" ke liye koi record nahi mila.\n`);
      process.exit(0);
    }
  }

  // Table print
  console.log(`\n📋 ${showAll ? 'Saare' : 'Active'} codes${searchQuery ? ` (search: "${searchQuery}")` : ''}:`);
  console.log('─'.repeat(100));
  console.log(pad('Line', 6) + pad('Date', 12) + pad('Machine', 14) + pad('Customer', 25) + pad('Valid Till', 14) + pad('Status', 12));
  console.log('─'.repeat(100));

  for (const e of entries) {
    const status = e.deleted ? '🗑 DELETED' : (e.until < todayISO() ? '⏰ EXPIRED' : '✅ ACTIVE');
    console.log(
      pad(`#${e.line}`, 6) +
      pad(e.timestamp.slice(0, 10), 12) +
      pad(e.machine, 14) +
      pad(truncate(e.name, 24), 25) +
      pad(e.until, 14) +
      pad(status, 12)
    );
  }
  console.log('─'.repeat(100));
  console.log(`Total: ${entries.length} record(s)`);
  console.log('');
  console.log('💡 Delete karne ke liye:  node keygen.mjs delete --line <Line#>');
  console.log('                   ya:    node keygen.mjs delete --machine XXXX-XXXX');
  console.log('                   ya:    node keygen.mjs delete --name "Customer Name"');
  console.log('');
  process.exit(0);
}

/* ─────────────────────────────────────────────
 *  DELETE — code delete karna
 * ───────────────────────────────────────────── */
if (command === 'delete') {
  const cliMachine = arg('machine')?.toUpperCase().trim();
  const cliName = arg('name')?.toLowerCase().trim();
  const cliLine = arg('line');

  let entries = readLogEntries().filter(e => !e.deleted);

  if (entries.length === 0) {
    console.log('\n📋 Koi active code nahi hai jo delete kiya ja sake.\n');
    process.exit(0);
  }

  let matches = [];
  if (cliLine) {
    const ln = Number(cliLine);
    matches = entries.filter(e => e.line === ln);
  } else if (cliMachine) {
    matches = entries.filter(e => e.machine === cliMachine);
  } else if (cliName) {
    matches = entries.filter(e => e.name.toLowerCase().includes(cliName));
  } else {
    // Interactive — list karo aur line number maango
    console.log('\n📋 Active codes:');
    console.log('─'.repeat(90));
    console.log(pad('Line', 6) + pad('Date', 12) + pad('Machine', 14) + pad('Customer', 25) + pad('Valid Till', 14));
    console.log('─'.repeat(90));
    for (const e of entries) {
      console.log(
        pad(`#${e.line}`, 6) +
        pad(e.timestamp.slice(0, 10), 12) +
        pad(e.machine, 14) +
        pad(truncate(e.name, 24), 25) +
        pad(e.until, 14)
      );
    }
    console.log('─'.repeat(90));
    const rl = readline.createInterface({ input: stdin, output: stdout });
    const input = (await rl.question('\nDelete karne ke liye Line# daayein (ya "machine:XXXX-XXXX" ya "name:Ahmad"): ')).trim();
    rl.close();
    if (!input) { console.log('Cancelled.'); process.exit(0); }
    if (input.startsWith('machine:')) {
      const m = input.slice(8).toUpperCase().trim();
      matches = entries.filter(e => e.machine === m);
    } else if (input.startsWith('name:')) {
      const n = input.slice(5).toLowerCase().trim();
      matches = entries.filter(e => e.name.toLowerCase().includes(n));
    } else {
      const ln = Number(input);
      matches = entries.filter(e => e.line === ln);
    }
  }

  if (matches.length === 0) {
    console.log('\n❌ Koi record match nahi hua.\n');
    process.exit(1);
  }

  // Confirm
  console.log(`\n🔍 ${matches.length} record(s) milein:`);
  for (const e of matches) {
    console.log(`   [${e.line}] ${e.name} — machine: ${e.machine} — valid till: ${e.until}`);
  }
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const confirm = (await rl.question('\n⚠️  Ye record(s) delete karein? [y/N]: ')).trim().toLowerCase();
  rl.close();
  if (confirm !== 'y' && confirm !== 'yes') {
    console.log('Cancelled.');
    process.exit(0);
  }

  // Mark as deleted (soft delete — record rehati hai, sirf deleted=true ho jaata hai)
  const allLines = readFileSync(logFile, 'utf8').trim().split('\n');
  const matchLines = new Set(matches.map(m => m.line));
  const newLines = allLines.map((line, idx) => {
    const lineNum = idx + 1;
    if (!matchLines.has(lineNum)) return line;
    try {
      const obj = JSON.parse(line);
      obj.deleted = true;
      obj.deleted_at = new Date().toISOString();
      return JSON.stringify(obj);
    } catch {
      // Old plain-text format — convert to JSONL with deleted=true
      return JSON.stringify({
        timestamp: new Date().toISOString(),
        machine: '',
        name: '',
        until: '',
        deleted: true,
        deleted_at: new Date().toISOString(),
        migrated_from: line,
      });
    }
  });
  writeFileSync(logFile, newLines.join('\n') + '\n', 'utf8');

  console.log(`\n✅ ${matches.length} record(s) delete ho gayi.\n`);
  console.log('💡 Note: Ye sirf aap ki local log se entry mark hoti hai.');
  console.log('   Agar customer ne code pehle activate kar liya hai, toh usay wapis lene ke liye');
  console.log('   same machine-id ke liye chhoti expiry (--days 1) ka naya code bana dein.\n');
  process.exit(0);
}

/* ─────────────────────────────────────────────
 *  HELP / DEFAULT
 * ───────────────────────────────────────────── */
console.log(`
Danish Cattle Feed — License Keygen v3

Usage:
  node keygen.mjs init                    Generate Ed25519 keypair (pehli dafaa)
  node keygen.mjs sync                    ⭐ Public key ko source + desktop bundle mein update karo
                                          (init ke baad zaroor chalayen!)
  node keygen.mjs code                    Interactive mode — naya activation code
  node keygen.mjs list                    Saare codes ki list
  node keygen.mjs list --search ahmad     Search by name / machine-id
  node keygen.mjs list --all              Deleted codes bhi dekhein
  node keygen.mjs delete                  Interactive delete (line#, machine, ya name)
  node keygen.mjs delete --line 2         Specific line delete
  node keygen.mjs delete --machine XXXX-XXXX    Machine ID se delete
  node keygen.mjs delete --name "Ahmad"   Customer name se delete

CLI code generation:
  node keygen.mjs code \\
    --machine XXXX-XXXX \\
    --name "Customer Name" \\
    --password "secret123" \\
    --months 1                            (--days N ya --until YYYY-MM-DD bhi)

Duration (koi ek):
  --months 1        1 mahine baad expire
  --months 12       1 saal baad expire
  --days 45         45 din baad expire
  --until 2026-12-31  specific date tak valid

⚠️  CRITICAL: Har baar \`init\` chalane ke baad \`sync\` chalana zaroori hai,
    warna naye codes app mein verify nahi honge!
`);

process.exit(0);

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
 *  Helper: pad / truncate
 * ───────────────────────────────────────────── */
function pad(str, len) {
  str = String(str);
  if (str.length >= len) return str.slice(0, len - 1) + ' ';
  return str + ' '.repeat(len - str.length);
}
function truncate(str, len) {
  str = String(str);
  return str.length > len ? str.slice(0, len - 1) + '…' : str;
}

/* ─────────────────────────────────────────────
 *  Helper: readLogEntries (backward-compatible)
 *  Supports both old plain-text format and new JSONL
 * ───────────────────────────────────────────── */
function readLogEntries() {
  if (!existsSync(logFile)) return [];
  const raw = readFileSync(logFile, 'utf8').trim();
  if (!raw) return [];
  const lines = raw.split('\n');
  return lines.map((line, idx) => {
    const lineNum = idx + 1;
    // Try JSONL first
    if (line.startsWith('{')) {
      try {
        const obj = JSON.parse(line);
        return {
          line: lineNum,
          timestamp: obj.timestamp || new Date().toISOString(),
          machine: (obj.machine || '').toUpperCase(),
          name: obj.name || '',
          until: obj.until || '',
          deleted: !!obj.deleted,
          deleted_at: obj.deleted_at || null,
        };
      } catch { /* fall through */ }
    }
    // Old plain-text format: [ISO] machine=XXXX-XXXX name="..." until=YYYY-MM-DD
    const m = line.match(/\[([^\]]+)\]\s+machine=(\S+)\s+name="([^"]+)"\s+until=(\S+)/);
    if (m) {
      return {
        line: lineNum,
        timestamp: m[1],
        machine: m[2].toUpperCase(),
        name: m[3],
        until: m[4],
        deleted: false,
        deleted_at: null,
      };
    }
    // Unknown format — skip
    return {
      line: lineNum,
      timestamp: new Date().toISOString(),
      machine: '',
      name: '(unparseable)',
      until: '',
      deleted: false,
      deleted_at: null,
    };
  });
}

/* ─────────────────────────────────────────────
 *  Helper: interactiveInput
 * ───────────────────────────────────────────── */
async function interactiveInput() {
  const rl = readline.createInterface({ input: stdin, output: stdout });

  try {
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║   Danish Cattle Feed — License Code Generator                 ║');
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

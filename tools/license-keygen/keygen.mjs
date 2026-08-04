#!/usr/bin/env node
/**
 * Danish Cattle Feed Software — License Keygen (SELLER-ONLY TOOL)
 *
 * Commands:
 *   node keygen.mjs init                              — Generate new Ed25519 keypair
 *   node keygen.mjs code --machine XXXX-XXXX --months 1
 *   node keygen.mjs code --machine XXXX-XXXX --until 2026-08-19
 *   node keygen.mjs code --machine XXXX-XXXX --days 45   (custom range)
 */
import { generateKeyPairSync, createPrivateKey, sign } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const keysDir = path.join(here, 'keys');
const privateKeyFile = path.join(keysDir, 'private.pem');
const publicKeyFile = path.join(keysDir, 'public.pem');

const [, , command, ...rest] = process.argv;

function arg(name) { const index = rest.indexOf(`--${name}`); return index >= 0 ? rest[index + 1] : undefined; }
function fail(message) { console.error(`ERROR: ${message}`); process.exit(1); }

if (command === 'init') {
  if (existsSync(privateKeyFile)) fail('keys/private.pem pehle se mojood hai — overwrite nahi karunga.');
  mkdirSync(keysDir, { recursive: true });
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  writeFileSync(privateKeyFile, privateKey.export({ type: 'pkcs8', format: 'pem' }));
  writeFileSync(publicKeyFile, publicKey.export({ type: 'spki', format: 'pem' }));
  console.log('Keypair ban gaya.\n');
  console.log('PUBLIC KEY (server/src/services/license.ts mein embed hoti hai):\n');
  console.log(readFileSync(publicKeyFile, 'utf8'));
  console.log('⚠ keys/private.pem ko mehfooz rakhein — yehi aap ka licensing raaz hai.');
  process.exit(0);
}

if (command === 'code') {
  const machine = (arg('machine') ?? '').toUpperCase().trim();
  if (!/^[0-9A-F]{4}-[0-9A-F]{4}$/.test(machine)) fail('--machine XXXX-XXXX format mein dein');

  let until = arg('until');
  const months = Number(arg('months') ?? (until ? 0 : 0));
  const days = Number(arg('days') ?? (until || months ? 0 : 0));

  if (!until) {
    const d = new Date();
    if (months > 0) d.setMonth(d.getMonth() + months);
    else if (days > 0) d.setDate(d.getDate() + days);
    else d.setMonth(d.getMonth() + 1); // default 1 month
    until = d.toISOString().slice(0, 10);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(until)) fail('--until YYYY-MM-DD format mein dein');
  if (new Date(until) <= new Date()) fail(`--until (${until}) aaj ke baad ki date honi chahiye`);
  if (!existsSync(privateKeyFile)) fail('Pehle "node keygen.mjs init" chalayen.');

  const privateKey = createPrivateKey(readFileSync(privateKeyFile, 'utf8'));
  const payload = `${machine}|${until}`;
  const signature = sign(null, Buffer.from(payload, 'utf8'), privateKey);
  const code = `${Buffer.from(payload, 'utf8').toString('base64url')}.${signature.toString('base64url')}`;

  console.log(`\nMachine : ${machine}`);
  console.log(`Valid   : ${until} tak`);
  console.log(`\nActivation Code (customer ko WhatsApp karein):\n`);
  console.log(code);
  console.log('');
  process.exit(0);
}

console.log('Usage:\n  node keygen.mjs init\n  node keygen.mjs code --machine XXXX-XXXX --months 1\n  node keygen.mjs code --machine XXXX-XXXX --days 45\n  node keygen.mjs code --machine XXXX-XXXX --until YYYY-MM-DD');

import { execSync } from 'node:child_process';
import { createHmac, createPublicKey, createHash, randomUUID, verify as edVerify } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { db } from '../db/connection.js';
import { logger } from '../logger.js';

/**
 * Monthly licensing (offline activation) — Ed25519.
 *
 * Seller ka keygen tool se JSON payload sign hota hai:
 *   { m: machineId, n: customerName, p: bcryptHash, e: expiry }
 *
 * App sirf PUBLIC key se verify karti hai. Activation pe admin
 * user ka naam + password bhi update ho jaata hai (taake har
 * machine ka apna login ho).
 */

const LICENSE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAe4U4edW/v7sV2xiDKhTP6mcn+G01RHOrBhgtCMM9e1E=
-----END PUBLIC KEY-----`;

const TRIAL_DAYS = 7;
const EXPIRY_WARN_DAYS = 5;
const CLOCK_TOLERANCE_MS = 6 * 60 * 60 * 1000;
const STATE_FILE = path.join(config.dataDir, 'license.json');

export type LicenseState = 'trial' | 'active' | 'expiring' | 'expired' | 'tampered';

export interface LicenseStatus {
  state: LicenseState;
  machine_id: string;
  licensed_until: string | null;
  licensed_from: string | null;
  days_left: number;
  trial: boolean;
  message: string;
  customer_name: string | null;
}

/** JSON payload jo keygen sign karta hai */
interface LicensePayload {
  m: string;  // machine_id (XXXX-XXXX)
  n: string;  // customer_name
  p: string;  // bcrypt password hash (EMPTY = renewal code, user table nahi chedo)
  e: string;  // expiry YYYY-MM-DD
}

interface StoredState {
  expiry: string;
  trial: boolean;
  last_seen: string;
  customer_name: string | null;
  activated_at: string | null;
  hmac: string;
}

/* ---- machine identity ---- */
function rawMachineId(): string {
  try {
    const out = execSync(
      'reg query HKLM\\SOFTWARE\\Microsoft\\Cryptography /v MachineGuid',
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    const match = out.match(/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]+)/);
    if (match?.[1]) return match[1].toLowerCase();
  } catch { /* fallback */ }
  const fallbackFile = path.join(config.dataDir, 'machine.id');
  if (existsSync(fallbackFile)) return readFileSync(fallbackFile, 'utf8').trim();
  const id = randomUUID();
  writeFileSync(fallbackFile, id, 'utf8');
  return id;
}

const machineHash = createHash('sha256').update(`dcf-v1:${rawMachineId()}`).digest('hex');
export const machineId = `${machineHash.slice(0, 4)}-${machineHash.slice(4, 8)}`.toUpperCase();

/* ---- sealed state file ---- */
const sealKey = createHash('sha256').update(`dcf-license-seal:${machineHash}`).digest();

function sealOf(state: Omit<StoredState, 'hmac'>): string {
  return createHmac('sha256', sealKey)
    .update(`${state.expiry}|${state.trial ? 1 : 0}|${state.last_seen}|${state.customer_name ?? ''}|${state.activated_at ?? ''}`)
    .digest('hex');
}

function writeState(state: Omit<StoredState, 'hmac'>): void {
  const stored: StoredState = { ...state, hmac: sealOf(state) };
  writeFileSync(STATE_FILE, JSON.stringify(stored, null, 2), 'utf8');
}

function readState(): StoredState | 'missing' | 'tampered' {
  if (!existsSync(STATE_FILE)) return 'missing';
  try {
    const stored = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as StoredState;
    // Backward-compat: purane state files mein customer_name / activated_at nahi tha
    if (stored.customer_name === undefined) stored.customer_name = null;
    if (stored.activated_at === undefined) stored.activated_at = null;
    const { hmac, ...rest } = stored;
    if (sealOf(rest) !== hmac) {
      // Backward-compat: purane state files (without activated_at) ke liye
      // legacy seal try karo
      const legacySeal = createHmac('sha256', sealKey)
        .update(`${stored.expiry}|${stored.trial ? 1 : 0}|${stored.last_seen}|${stored.customer_name ?? ''}`)
        .digest('hex');
      if (legacySeal === hmac) {
        // Purana file hai — naya field add karke re-seal kardo
        const newState = { ...stored, activated_at: stored.last_seen };
        writeState(newState);
        return newState;
      }
      return 'tampered';
    }
    return stored;
  } catch {
    return 'tampered';
  }
}

/* ---- status + heartbeat ---- */
let cachedStatus: LicenseStatus | null = null;
let cachedAt = 0;
let cachedMtime = -1;
const STATUS_TTL_MS = 30_000;
const HEARTBEAT_EVERY_MS = 5 * 60 * 1000;

function stateMtime(): number {
  try { return statSync(STATE_FILE).mtimeMs; } catch { return 0; }
}

function daysBetween(from: Date, toDateStr: string): number {
  const end = new Date(`${toDateStr}T23:59:59`);
  return Math.ceil((end.getTime() - from.getTime()) / 86_400_000);
}

function computeStatus(): LicenseStatus {
  const now = new Date();
  let state = readState();

  if (state === 'missing') {
    const expiry = new Date(now.getTime() + TRIAL_DAYS * 86_400_000).toISOString().slice(0, 10);
    writeState({ expiry, trial: true, last_seen: now.toISOString(), customer_name: null, activated_at: now.toISOString() });
    state = readState() as StoredState;
    logger.info({ expiry }, 'License: fresh install — trial started');
  }

  if (state === 'tampered') {
    return {
      state: 'tampered', machine_id: machineId, licensed_until: null, licensed_from: null,
      days_left: 0, trial: false, customer_name: null,
      message: 'License file kharab ya tabdeel hui hai — naya activation code darkar hai.',
    };
  }

  const lastSeen = new Date(state.last_seen).getTime();
  if (now.getTime() < lastSeen - CLOCK_TOLERANCE_MS) {
    return {
      state: 'tampered', machine_id: machineId, licensed_until: state.expiry, licensed_from: state.activated_at,
      days_left: 0, trial: state.trial, customer_name: state.customer_name,
      message: 'System ki date/time peeche ki gayi hai — sahi karein ya naya code lein.',
    };
  }

  if (now.getTime() - lastSeen > HEARTBEAT_EVERY_MS) {
    writeState({ expiry: state.expiry, trial: state.trial, last_seen: now.toISOString(), customer_name: state.customer_name, activated_at: state.activated_at });
  }

  const daysLeft = daysBetween(now, state.expiry);
  if (daysLeft <= 0) {
    return {
      state: 'expired', machine_id: machineId, licensed_until: state.expiry, licensed_from: state.activated_at,
      days_left: 0, trial: state.trial, customer_name: state.customer_name,
      message: state.trial ? 'Trial khatam ho gaya — activation code lein.' : 'License muddat khatam — naya code lein.',
    };
  }

  return {
    state: daysLeft <= EXPIRY_WARN_DAYS ? 'expiring' : state.trial ? 'trial' : 'active',
    machine_id: machineId,
    licensed_until: state.expiry,
    licensed_from: state.activated_at,
    days_left: daysLeft,
    trial: state.trial,
    customer_name: state.customer_name,
    message:
      daysLeft <= EXPIRY_WARN_DAYS
        ? `License ${daysLeft} din mein khatam — waqt par naya code le lein.`
        : state.trial ? `Trial chal raha hai — ${daysLeft} din baqi.` : 'License active hai.',
  };
}

export function licenseStatus(force = false): LicenseStatus {
  const now = Date.now();
  const mtime = stateMtime();
  if (!force && cachedStatus && mtime === cachedMtime && now - cachedAt < STATUS_TTL_MS) {
    return cachedStatus;
  }
  cachedStatus = computeStatus();
  cachedAt = now;
  cachedMtime = stateMtime();
  return cachedStatus;
}

/* ---- activation ---- */
const publicKey = createPublicKey(LICENSE_PUBLIC_KEY_PEM);

export function activateLicense(code: string): LicenseStatus {
  const parts = code.trim().split('.');
  if (parts.length !== 2) throw new LicenseError('Code ka format ghalat hai — poora code paste karein.');

  const payloadB64 = parts[0]!;
  const sigB64 = parts[1]!;

  let payloadJson: string;
  let signature: Buffer;
  try {
    payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf8');
    signature = Buffer.from(sigB64, 'base64url');
  } catch {
    throw new LicenseError('Code parh nahi saka — dobara copy/paste karein.');
  }

  // Ed25519 signature verify (proves seller ne sign kiya)
  const valid = edVerify(null, Buffer.from(payloadJson, 'utf8'), publicKey, signature);
  if (!valid) throw new LicenseError('Code ghalat hai (signature match nahi karti).');

  let payload: LicensePayload;
  try {
    payload = JSON.parse(payloadJson) as LicensePayload;
  } catch {
    throw new LicenseError('Code ka content ghalat hai.');
  }

  if (!payload.m || !/^[0-9A-F]{4}-[0-9A-F]{4}$/.test(payload.m)) {
    throw new LicenseError('Code mein Machine ID ghalat hai.');
  }
  if (payload.m !== machineId) {
    throw new LicenseError(`Ye code kisi aur machine (${payload.m}) ka hai — is PC ka Machine ID ${machineId} batayen.`);
  }
  if (!payload.e || !/^\d{4}-\d{2}-\d{2}$/.test(payload.e)) {
    throw new LicenseError('Code mein date ghalat hai.');
  }
  if (daysBetween(new Date(), payload.e) <= 0) {
    throw new LicenseError('Ye code purana hai (muddat guzar chuki) — naya code lein.');
  }
  if (!payload.n || !payload.n.trim()) {
    throw new LicenseError('Code mein customer name nahi hai — keygen update karein.');
  }
  // p field ab optional hai:
  //   - Agar p present hai ($2 se start) → full code → admin user upsert hoga
  //   - Agar p empty/missing hai → renewal code → sirf license extend hoga, user table nahi chedo
  if (payload.p && !payload.p.startsWith('$2')) {
    throw new LicenseError('Code mein password hash ghalat hai.');
  }

  // ── Admin user upsert (sirf full code ke liye) ──
  // Renewal code (p empty) par user table nahi chedo — customer apna purana
  // username/password use karta hai. Is liye renewal sirf us machine par
  // chalega jahan pehle se admin user mojood hai.
  if (payload.p && payload.p.startsWith('$2')) {
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get('admin') as { id: number } | undefined;
    if (!existing) {
      db.prepare('INSERT INTO users (name, username, password_hash, role) VALUES (?, ?, ?, ?)')
        .run(payload.n.trim(), 'admin', payload.p, 'admin');
      logger.info({ name: payload.n, machineId }, 'License: admin user created from activation');
    } else {
      db.prepare('UPDATE users SET name = ?, password_hash = ? WHERE username = ?')
        .run(payload.n.trim(), payload.p, 'admin');
      logger.info({ name: payload.n, machineId }, 'License: admin user updated from activation');
    }
  } else {
    // Renewal code — password change nahi hoga
    // Agar is machine par pehle se koi admin user nahi hai (fresh install
    // jahan seed ka default admin bhi nahi bana), to customer login nahi kar
    // payega. Is case mein clear error do.
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get('admin') as { id: number } | undefined;
    if (!existing) {
      throw new LicenseError('Ye renewal code hai (bina password ke). Pehle full activation code chahiye jisme password ho — software walay se full code lein.');
    }
    logger.info({ name: payload.n, machineId }, 'License: renewal activation (password unchanged)');
  }

  writeState({ expiry: payload.e, trial: false, last_seen: new Date().toISOString(), customer_name: payload.n.trim(), activated_at: new Date().toISOString() });
  logger.info({ expiry: payload.e, machineId, customer: payload.n }, 'License activated');
  return licenseStatus(true);
}

export class LicenseError extends Error {}

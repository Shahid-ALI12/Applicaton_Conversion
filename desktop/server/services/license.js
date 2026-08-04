import { execSync } from 'node:child_process';
import { createHmac, createPublicKey, createHash, randomUUID, verify as edVerify } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { logger } from '../logger.js';
/**
 * Monthly licensing (offline activation) — Ed25519.
 * Seller ka keygen tool se `machineId|expiry` sign hota hai;
 * app sirf PUBLIC key se verify karti hai.
 */
const LICENSE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA9w0E63UlE3xeoePgks+NBcJ/TKGhlal8eHBUSnGHXOU=
-----END PUBLIC KEY-----`;
const TRIAL_DAYS = 7;
const EXPIRY_WARN_DAYS = 5;
const CLOCK_TOLERANCE_MS = 6 * 60 * 60 * 1000;
const STATE_FILE = path.join(config.dataDir, 'license.json');
/* ---- machine identity ---- */
function rawMachineId() {
    try {
        const out = execSync('reg query HKLM\\SOFTWARE\\Microsoft\\Cryptography /v MachineGuid', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        const match = out.match(/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]+)/);
        if (match?.[1])
            return match[1].toLowerCase();
    }
    catch { /* fallback */ }
    const fallbackFile = path.join(config.dataDir, 'machine.id');
    if (existsSync(fallbackFile))
        return readFileSync(fallbackFile, 'utf8').trim();
    const id = randomUUID();
    writeFileSync(fallbackFile, id, 'utf8');
    return id;
}
const machineHash = createHash('sha256').update(`dcf-v1:${rawMachineId()}`).digest('hex');
export const machineId = `${machineHash.slice(0, 4)}-${machineHash.slice(4, 8)}`.toUpperCase();
/* ---- sealed state file ---- */
const sealKey = createHash('sha256').update(`dcf-license-seal:${machineHash}`).digest();
function sealOf(state) {
    return createHmac('sha256', sealKey)
        .update(`${state.expiry}|${state.trial ? 1 : 0}|${state.last_seen}`)
        .digest('hex');
}
function writeState(state) {
    const stored = { ...state, hmac: sealOf(state) };
    writeFileSync(STATE_FILE, JSON.stringify(stored, null, 2), 'utf8');
}
function readState() {
    if (!existsSync(STATE_FILE))
        return 'missing';
    try {
        const stored = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
        const { hmac, ...rest } = stored;
        if (sealOf(rest) !== hmac)
            return 'tampered';
        return stored;
    }
    catch {
        return 'tampered';
    }
}
/* ---- status + heartbeat ---- */
let cachedStatus = null;
let cachedAt = 0;
let cachedMtime = -1;
const STATUS_TTL_MS = 30_000;
const HEARTBEAT_EVERY_MS = 5 * 60 * 1000;
function stateMtime() {
    try {
        return statSync(STATE_FILE).mtimeMs;
    }
    catch {
        return 0;
    }
}
function daysBetween(from, toDateStr) {
    const end = new Date(`${toDateStr}T23:59:59`);
    return Math.ceil((end.getTime() - from.getTime()) / 86_400_000);
}
function computeStatus() {
    const now = new Date();
    let state = readState();
    if (state === 'missing') {
        const expiry = new Date(now.getTime() + TRIAL_DAYS * 86_400_000).toISOString().slice(0, 10);
        writeState({ expiry, trial: true, last_seen: now.toISOString() });
        state = readState();
        logger.info({ expiry }, 'License: fresh install — trial started');
    }
    if (state === 'tampered') {
        return {
            state: 'tampered', machine_id: machineId, licensed_until: null,
            days_left: 0, trial: false,
            message: 'License file kharab ya tabdeel hui hai — naya activation code darkar hai.',
        };
    }
    const lastSeen = new Date(state.last_seen).getTime();
    if (now.getTime() < lastSeen - CLOCK_TOLERANCE_MS) {
        return {
            state: 'tampered', machine_id: machineId, licensed_until: state.expiry,
            days_left: 0, trial: state.trial,
            message: 'System ki date/time peeche ki gayi hai — sahi karein ya naya code lein.',
        };
    }
    if (now.getTime() - lastSeen > HEARTBEAT_EVERY_MS) {
        writeState({ expiry: state.expiry, trial: state.trial, last_seen: now.toISOString() });
    }
    const daysLeft = daysBetween(now, state.expiry);
    if (daysLeft <= 0) {
        return {
            state: 'expired', machine_id: machineId, licensed_until: state.expiry,
            days_left: 0, trial: state.trial,
            message: state.trial ? 'Trial khatam ho gaya — activation code lein.' : 'License muddat khatam — naya code lein.',
        };
    }
    return {
        state: daysLeft <= EXPIRY_WARN_DAYS ? 'expiring' : state.trial ? 'trial' : 'active',
        machine_id: machineId,
        licensed_until: state.expiry,
        days_left: daysLeft,
        trial: state.trial,
        message: daysLeft <= EXPIRY_WARN_DAYS
            ? `License ${daysLeft} din mein khatam — waqt par naya code le lein.`
            : state.trial ? `Trial chal raha hai — ${daysLeft} din baqi.` : 'License active hai.',
    };
}
export function licenseStatus(force = false) {
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
export function activateLicense(code) {
    const parts = code.trim().split('.');
    if (parts.length !== 2)
        throw new LicenseError('Code ka format ghalat hai — poora code paste karein.');
    let payload;
    let signature;
    try {
        payload = Buffer.from(parts[0], 'base64url').toString('utf8');
        signature = Buffer.from(parts[1], 'base64url');
    }
    catch {
        throw new LicenseError('Code parh nahi saka — dobara copy/paste karein.');
    }
    const valid = edVerify(null, Buffer.from(payload, 'utf8'), publicKey, signature);
    if (!valid)
        throw new LicenseError('Code ghalat hai (signature match nahi karti).');
    const [codeMachine, expiry] = payload.split('|');
    if (codeMachine !== machineId) {
        throw new LicenseError(`Ye code kisi aur machine (${codeMachine}) ka hai — is PC ka Machine ID ${machineId} batayen.`);
    }
    if (!expiry || !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
        throw new LicenseError('Code mein date ghalat hai.');
    }
    if (daysBetween(new Date(), expiry) <= 0) {
        throw new LicenseError('Ye code purana hai (muddat guzar chuki) — naya code lein.');
    }
    writeState({ expiry, trial: false, last_seen: new Date().toISOString() });
    logger.info({ expiry, machineId }, 'License activated');
    return licenseStatus(true);
}
export class LicenseError extends Error {
}
//# sourceMappingURL=license.js.map